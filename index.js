#!/usr/bin/env node
"use strict";

const readline = require("readline");
const util = require("util");
const Steam = require("steam-user");
const TOTP = require("steam-totp");

console.log(`Documentation: https://github.com/tacheometry/steam-hour-farmer`);

require("dotenv").config();
let { USERNAME, PASSWORD, PERSONA, GAMES, SHARED_SECRET } = process.env;
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

	shouldExist("USERNAME");
	shouldExist("PASSWORD");
	shouldExist("GAMES");
}

const SHOULD_PLAY = GAMES.split(",").map((n) => parseInt(n));
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

const User = new Steam({
	machineIdType: Steam.EMachineIDType.PersistentRandom,
	dataDirectory: "SteamData",
});

const logOn = () => {
	User.logOn({
		accountName: USERNAME,
		password: PASSWORD,
		rememberPassword: true,
		clientOS: Steam.EOSType.Windows10,
		twoFactorCode: SHARED_SECRET
			? TOTP.generateAuthCode(SHARED_SECRET)
			: undefined,
		autoRelogin: true,
	});
};

const panic = (message = "Exiting...") => {
	console.error(message);
	process.exit(1);
};

let playingOnOtherSession = false;
let currentNotification;
const refreshGames = () => {
	let notification;
	if (playingOnOtherSession) {
		notification = "Farming is paused.";
	} else {
		User.gamesPlayed(SHOULD_PLAY);
		notification = "Farming...";
	}
	if (currentNotification !== notification) {
		currentNotification = notification;
		console.log(notification);
	}
};

User.on("steamGuard", async (domain, callback) => {
	if (SHARED_SECRET) return callback(getTOTP());
	const manualCode = await consoleQuestion(
		`Enter Steam Guard code` +
			(domain ? ` for email at ${domain}` : "") +
			": "
	);
	callback(manualCode);
});

User.on("playingState", (blocked, app) => {
	playingOnOtherSession = blocked;
	refreshGames();
});

User.on("loggedOn", () => {
	console.log(`Successfully logged in to Steam with ID ${User.steamID}`);
	if (PERSONA !== undefined) User.setPersona(PERSONA);

	// Allow time to receive the playingState event to see if playing on another session if that's the case
	setTimeout(refreshGames, 5000);
});

User.on("error", (e) => {
	if (e.eresult === Steam.EResult.LoggedInElsewhere) {
		console.log("Got kicked by other Steam session. Logging in again...");
		logOn();
		return;
	}
	panic(`Got an error from Steam: "${e.message}".`);
});

logOn();

setInterval(refreshGames, 20 * 1000);
