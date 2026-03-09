#!/usr/bin/env node
"use strict";

const readline = require("node:readline");
const util = require("node:util");
const path = require("node:path");
const fs = require("node:fs");
const Steam = require("steam-user");
const TOTP = require("steam-totp");
const { LoginSession, EAuthTokenPlatformType } = require("steam-session");
const qrcode = require("qrcode-terminal");

const MACHINE_NAME = "steam-hour-farmer";
const MACHINE_TYPE = Steam.EOSType.Windows10;
const DATA_DIRECTORY = "SteamData";
const MIN_REQUEST_TIME = 60 * 1000;
const LOG_ON_INTERVAL = 10 * 60 * 1000;
const REFRESH_GAMES_INTERVAL = 5 * 60 * 1000;
const REFRESH_TOKEN_PATH = path.join(DATA_DIRECTORY, "refreshToken.txt");

console.log("Documentation: https://github.com/tacheometry/steam-hour-farmer");

function panic(reason) {
	console.error("PANIC:", reason);
	process.exit(1);
}

const readlineInterface = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

const consoleQuestion = util
	.promisify(readlineInterface.question)
	.bind(readlineInterface);

require("dotenv").config();

let { ACCOUNT_NAME, PASSWORD, PERSONA, GAMES, SHARED_SECRET } = process.env;

{
	function checkVar(name) {
		return process.env[name] !== undefined;
	}

	function assertVar(name) {
		checkVar(name) || panic(`Missing variable: ${name}`);
	}

	function assertVarAnd(names) {
		const values = names.map(checkVar).reduce((a, b) => a == b);

		values || panic(`Either use ${names.join(", ")} or none of them.`);
	}

	PERSONA = Number.parseInt(PERSONA);

	assertVarAnd(["ACCOUNT_NAME", "PASSWORD"]);
	assertVar("GAMES");
}

const SHOULD_PLAY = GAMES.split(",").map((game) => {
	const asNumber = Number.parseInt(game);

	return Number.isNaN(asNumber) ? game : asNumber;
});

if (SHOULD_PLAY.length === 0)
	console.warn("Could not find any games to play. Maybe this is a mistake?");

const getTOTP = TOTP.generateAuthCode.bind(this, SHARED_SECRET);

async function loginAttemptViaQrCode() {
	const session = new LoginSession(EAuthTokenPlatformType.SteamClient);

	const promise = new Promise((resolve, reject) => {
		session.on("remoteInteraction", () => {
			console.log("QR code scanned, awaiting for approval...");
		});

		session.on("error", (error) => {
			reject(error);
		});

		session.on("timeout", () => {
			reject(new Error("Timed out while waiting for QR code approval."));
		});

		session.on("authenticated", () => {
			resolve(session.refreshToken);
		});
	});

	const challenge = await session.startWithQR();

	console.log("Please scan the following QR code in your mobile app:");
	qrcode.generate(challenge.qrChallengeUrl, { small: true });

	return await promise;
}

async function loginViaQrCode() {
	while (true) {
		let result;
		try {
			result = await loginAttemptViaQrCode();
		} catch (error) {
			console.log(error.message);
		}

		if (result) {
			return result;
		}
	}
}

const steamUser = new Steam({
	machineIdType: Steam.EMachineIDType.PersistentRandom,
	dataDirectory: DATA_DIRECTORY,
	renewRefreshTokens: true,
});

let playingOnOtherSession = false;
let currentNotification;
let authenticated = false;
let lastGameRefreshTime = new Date(0);
let lastLogOnTime = new Date(0);
let onlyLogInAfter = new Date(0);
let ignoreErrors = false;

async function logOn() {
	if (authenticated) return;
	if (Date.now() - lastLogOnTime <= MIN_REQUEST_TIME) return;
	if (Date.now() < onlyLogInAfter) return;

	if (fs.existsSync(REFRESH_TOKEN_PATH)) {
		console.log("Logging in via persistent refresh token...");

		const promise = new Promise((resolve, _reject) => {
			function onLoggedOn() {
				cleanup();
				resolve(true);
			}

			function onError(error) {
				console.log(`Got error: ${error.message}`);
				cleanup();
				resolve(false);
			}

			function cleanup() {
				ignoreErrors = false;
				steamUser.removeListener("loggedOn", onLoggedOn);
				steamUser.removeListener("error", onError);
			}

			ignoreErrors = true;
			steamUser.once("loggedOn", onLoggedOn);
			steamUser.once("error", onError);
		});

		steamUser.logOn({
			refreshToken: fs.readFileSync(REFRESH_TOKEN_PATH, "utf8"),
		});

		const result = await promise;
		if (result) {
			lastLogOnTime = Date.now();
			return;
		}

		console.log("Failed to log in via persistent refresh token.");
	}

	let authData;

	if (ACCOUNT_NAME && PASSWORD) {
		console.log("Logging in via username and password...");
		authData = {
			accountName: ACCOUNT_NAME,
			password: PASSWORD,
		};
	} else {
		console.log("Logging in via QR code...");
		const refreshToken = await loginViaQrCode();

		fs.writeFileSync(REFRESH_TOKEN_PATH, refreshToken);

		authData = {
			refreshToken: refreshToken,
		};
	}

	steamUser.logOn({
		...authData,
		machineName: MACHINE_NAME,
		clientOS: MACHINE_TYPE,
		twoFactorCode: SHARED_SECRET ? getTOTP : undefined,
		autoRelogin: true,
	});

	lastLogOnTime = Date.now();
}

function refreshGames() {
	if (!authenticated) return;

	let notification;

	if (playingOnOtherSession) {
		notification = "Farming is paused.";
	} else {
		if (Date.now() - lastGameRefreshTime <= MIN_REQUEST_TIME) return;
		steamUser.gamesPlayed(SHOULD_PLAY);
		notification = "Farming...";
		lastGameRefreshTime = Date.now();
	}

	if (currentNotification !== notification) {
		currentNotification = notification;
		console.log(notification);
	}
}

steamUser.on("refreshToken", (token) => {
	console.log("Got a new refresh token.");
	fs.writeFileSync(REFRESH_TOKEN_PATH, token);
});

steamUser.on("steamGuard", async (domain, callback) => {
	let result;

	if (SHARED_SECRET) {
		result = getTOTP();
	} else {
		result = await consoleQuestion(
			`Enter Steam Guard code` +
				(domain ? ` for email at ${domain}` : "") +
				": ",
		);
	}

	callback(result);
});

steamUser.on("playingState", (blocked, app) => {
	playingOnOtherSession = blocked;
	refreshGames();
});

steamUser.on("loggedOn", () => {
	authenticated = true;
	console.log(
		`Successfully logged in to Steam with ID ${steamUser.steamID} (${steamUser.vanityURL})`,
	);
	if (PERSONA !== undefined) steamUser.setPersona(PERSONA);
	refreshGames();
});

steamUser.on("error", (e) => {
	if (ignoreErrors) {
		return;
	}

	switch (e.eresult) {
		case Steam.EResult.LoggedInElsewhere: {
			authenticated = false;
			console.log(
				"Got kicked by other Steam session. Will log in shortly...",
			);
			logOn();
			return;
		}
		case Steam.EResult.RateLimitExceeded: {
			authenticated = false;
			onlyLogInAfter = Date.now() + 31 * 60 * 1000;
			console.log(
				"Got rate limited by Steam. Will try logging in again in 30 minutes.",
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
