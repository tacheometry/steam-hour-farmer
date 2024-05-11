#!/usr/bin/env node
"use strict";

const readline = require("readline");
const util = require("util");
const Steam = require("steam-user");
const TOTP = require("steam-totp");

console.log(`Documentation: https://github.com/tacheometry/steam-hour-farmer`);

require("dotenv").config();
let { ACCOUNT_NAME, PASSWORD, PERSONA, GAMES, SHARED_SECRET } = process.env;
{
	PERSONA = parseInt(PERSONA);
	const shouldExist = (name) => {
		if (!process.env[name]) {
			console.error(
				`Environment variable "${name}" should be provided, but it is undefined.`
			);
			process.exit(1);
		}
	};

	shouldExist("ACCOUNT_NAME");
	shouldExist("PASSWORD");
	shouldExist("GAMES");
}

const SHOULD_PLAY = GAMES.split(",").map((game) => {
	const asNumber = parseInt(game);
	// NaN
	if (asNumber !== asNumber) return game;
	return asNumber;
});
if (SHOULD_PLAY.length === 0)
	console.warn("Could not find any games to play. Maybe this is a mistake?");

const readlineInterface = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});
const consoleQuestion = util
	.promisify(readlineInterface.question)
	.bind(readlineInterface);

const getTOTP = () => TOTP.generateAuthCode(SHARED_SECRET);

const user = new Steam({
	machineIdType: Steam.EMachineIDType.PersistentRandom,
	dataDirectory: "SteamData",
	renewRefreshTokens: true,
});

let playingOnOtherSession = false;
let currentNotification;
let authenticated = false;
let MIN_REQUEST_TIME = 60 * 1000;
let LOG_ON_INTERVAL = 10 * 60 * 1000;
let REFRESH_GAMES_INTERVAL = 5 * 60 * 1000;
let lastGameRefreshTime = new Date(0);
let lastLogOnTime = new Date(0);
let onlyLogInAfter = new Date(0);

const logOn = () => {
	if (authenticated) return;
	if (Date.now() - lastLogOnTime <= MIN_REQUEST_TIME) return;
	if (Date.now() < onlyLogInAfter) return;
	console.log("Logging in...");
	user.logOn({
		accountName: ACCOUNT_NAME,
		password: PASSWORD,
		machineName: "steam-hour-farmer",
		clientOS: Steam.EOSType.Windows10,
		twoFactorCode: SHARED_SECRET
			? TOTP.generateAuthCode(SHARED_SECRET)
			: undefined,
		autoRelogin: true,
	});
	lastLogOnTime = Date.now();
};

const panic = (message = "Exiting...") => {
	console.error(message);
	process.exit(1);
};

const refreshGames = () => {
	if (!authenticated) return;
	let notification;
	if (playingOnOtherSession) {
		notification = "Farming is paused.";
	} else {
		if (Date.now() - lastGameRefreshTime <= MIN_REQUEST_TIME) return;
		user.gamesPlayed(SHOULD_PLAY);
		notification = "Farming...";
		lastGameRefreshTime = Date.now();
	}
	if (currentNotification !== notification) {
		currentNotification = notification;
		console.log(notification);
	}
};

user.on("steamGuard", async (domain, callback) => {
	if (SHARED_SECRET) return callback(getTOTP());
	const manualCode = await consoleQuestion(
		`Enter Steam Guard code` +
			(domain ? ` for email at ${domain}` : "") +
			": "
	);
	callback(manualCode);
});

user.on("playingState", (blocked, app) => {
	playingOnOtherSession = blocked;
	refreshGames();
});

user.on("loggedOn", () => {
	authenticated = true;
	console.log(`Successfully logged in to Steam with ID ${user.steamID}`);
	if (PERSONA !== undefined) user.setPersona(PERSONA);
	refreshGames();
});

user.on("error", (e) => {
	switch (e.eresult) {
		case Steam.EResult.LoggedInElsewhere: {
			authenticated = false;
			console.log(
				"Got kicked by other Steam session. Will log in shortly..."
			);
			logOn();
			return;
		}
		case Steam.EResult.RateLimitExceeded: {
			authenticated = false;
			onlyLogInAfter = Date.now() + 31 * 60 * 1000;
			console.log(
				"Got rate limited by Steam. Will try logging in again in 30 minutes."
			);
			return;
		}
		default: {
			panic(`Got an error from Steam: "${e.message}".`);
		}
	}
});

logOn();
setInterval(logOn, LOG_ON_INTERVAL);
setInterval(refreshGames, REFRESH_GAMES_INTERVAL);
