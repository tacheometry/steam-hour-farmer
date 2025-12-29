#!/usr/bin/env node
"use strict";

const readline = require("readline");
const util = require("util");
const Steam = require("steam-user");
const TOTP = require("steam-totp");
const fs = require("fs");
const dotenv = require("dotenv");

console.log(`Documentation: https://github.com/tacheometry/steam-hour-farmer`);

const MIN_REQUEST_TIME = 60 * 1000;
const CHECK_INTERVAL = 5 * 60 * 1000;

const readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const consoleQuestion = util.promisify(readlineInterface.question).bind(readlineInterface);

let envContent;
try {
    envContent = fs.readFileSync(".env", "utf8");
} catch (error) {
    if (error.code === 'ENOENT') {
        console.error("Error: .env file not found in the current directory.");
        console.error("Please create a .env file with your Steam account details.");
    } else {
        console.error("Error reading .env file:", error.message);
    }
    process.exit(1);
}

const lines = envContent.split("\n");
const accounts = [];
let currentAccountLines = [];

lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed === "[STEAM_ACCOUNT]") {
        if (currentAccountLines.length > 0) {
            const accountEnv = currentAccountLines.join("\n");
            const accountConfig = dotenv.parse(accountEnv);
            accounts.push(accountConfig);
            currentAccountLines = [];
        }
    } else {
        currentAccountLines.push(line);
    }
});

if (currentAccountLines.length > 0) {
    const accountEnv = currentAccountLines.join("\n");
    const accountConfig = dotenv.parse(accountEnv);
    accounts.push(accountConfig);
}

const processedAccounts = accounts
    .map((accountConfig) => {
        const account = {
            ACCOUNT_NAME: accountConfig.ACCOUNT_NAME,
            PASSWORD: accountConfig.PASSWORD,
            SHARED_SECRET: accountConfig.SHARED_SECRET || "",
            GAMES: accountConfig.GAMES
                ? accountConfig.GAMES.split(",").map((game) => {
                      const asNumber = parseInt(game.trim());
                      return isNaN(asNumber) ? game.trim() : asNumber;
                  })
                : [],
            PERSONA: accountConfig.PERSONA ? parseInt(accountConfig.PERSONA) : undefined,
        };

        if (!account.ACCOUNT_NAME || !account.PASSWORD || account.GAMES.length === 0) {
            console.error(
                `Account missing required fields (ACCOUNT_NAME, PASSWORD, or GAMES) for "${account.ACCOUNT_NAME || "unknown"}". Skipping.`
            );
            return null;
        }

        return account;
    })
    .filter((account) => account !== null);

if (processedAccounts.length === 0) {
    console.error("No valid accounts found in .env file.");
    process.exit(1);
}

const clients = processedAccounts.map((account) => ({
    account,
    user: new Steam({
        machineIdType: Steam.EMachineIDType.PersistentRandom,
        dataDirectory: `SteamData/${account.ACCOUNT_NAME}`,
        renewRefreshTokens: true,
    }),
    authenticated: false,
    playingOnOtherSession: false,
    currentNotification: "",
    lastLogOnTime: new Date(0),
    onlyLogInAfter: new Date(0),
}));

const logOn = (client) => {
    if (client.authenticated) return;
    if (Date.now() - client.lastLogOnTime <= MIN_REQUEST_TIME) return;
    if (Date.now() < client.onlyLogInAfter) return;

    console.log(`Logging in for account "${client.account.ACCOUNT_NAME}"...`);
    client.user.logOn({
        accountName: client.account.ACCOUNT_NAME,
        password: client.account.PASSWORD,
        machineName: "steam-hour-farmer",
        clientOS: Steam.EOSType.Windows11,
        twoFactorCode: client.account.SHARED_SECRET
            ? TOTP.generateAuthCode(client.account.SHARED_SECRET)
            : undefined,
        autoRelogin: true,
    });
    client.lastLogOnTime = Date.now();
};

const refreshGames = (client) => {
    if (!client.authenticated || client.playingOnOtherSession) return;

    client.user.gamesPlayed(client.account.GAMES);
    const notification = `Farming hours on ${client.account.GAMES.join(", ")} for "${client.account.ACCOUNT_NAME}"`;
    if (client.currentNotification !== notification) {
        client.currentNotification = notification;
        console.log(notification);
    }
};

clients.forEach((client) => {
    client.user.on("steamGuard", async (domain, callback) => {
        if (client.account.SHARED_SECRET) {
            return callback(TOTP.generateAuthCode(client.account.SHARED_SECRET));
        }
        const code = await consoleQuestion(
            `Enter Steam Guard code for "${client.account.ACCOUNT_NAME}"${domain ? ` (email: ${domain})` : ""}: `
        );
        callback(code.trim());
    });

    client.user.on("playingState", (blocked, playingApp) => {
        if (client.playingOnOtherSession !== blocked) {
            client.playingOnOtherSession = blocked;
            if (!blocked) {
                console.log(`Play block cleared for "${client.account.ACCOUNT_NAME}". Resuming farming...`);
            }
        }
        refreshGames(client);
    });

    client.user.on("loggedOn", () => {
        client.authenticated = true;
        client.playingOnOtherSession = false;
        console.log(`Logged in successfully: "${client.account.ACCOUNT_NAME}" (ID: ${client.user.steamID})`);

        if (client.account.PERSONA !== undefined) {
            client.user.setPersona(client.account.PERSONA);
        }
        refreshGames(client);
    });

    client.user.on("disconnected", (eresult, msg) => {
        client.authenticated = false;
        console.log(`Disconnected from Steam for "${client.account.ACCOUNT_NAME}" (${msg || eresult})`);
    });

    client.user.on("error", (err) => {
        client.authenticated = false;

        switch (err.eresult) {
            case Steam.EResult.LoggedInElsewhere:
                console.log(`Kicked: Another session is using "${client.account.ACCOUNT_NAME}". Waiting for it to free up...`);
                break;

            case Steam.EResult.RateLimitExceeded:
                client.onlyLogInAfter = Date.now() + 30 * 60 * 1000;
                console.log(`Rate limited for "${client.account.ACCOUNT_NAME}". Retrying in 30 minutes.`);
                break;

            default:
                client.onlyLogInAfter = Date.now() + 10 * 60 * 1000;
                console.error(`Error for "${client.account.ACCOUNT_NAME}": ${err.message} (${err.eresult}). Retrying in 10 minutes.`);
                break;
        }
    });
});

setInterval(() => {
    clients.forEach((client) => {
        if (!client.authenticated) {
            logOn(client);
        }
        if (client.authenticated && !client.playingOnOtherSession) {
            refreshGames(client);
        }
    });
}, CHECK_INTERVAL);

clients.forEach((client) => {
    logOn(client);
});
