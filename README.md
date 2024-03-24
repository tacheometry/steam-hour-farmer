# Simple Steam hour farmer

_`steam-hour-farmer` is a program that emulates you playing a game on Steam, with the purpose of effortlessly getting hours played on certain games on your profile._

-   Can be deployed on a VPS to run 24/7.
-   Only requires the games to be in your Steam library - they don't need to be installed.
-   When you start playing games on your main computer, it pauses automatically.
-   After you're finished playing, the bot resumes automatically (provided it's able to log in again).
-   Doesn't require multiple accounts.
-   Inspired by [@Gunthersuper/steam-idle-bot](https://github.com/Gunthersuper/steam-idle-bot).

## How to use

1. Have Node.js configured (minimum version 16). This can be done through [nvm](https://github.com/nvm-sh/nvm) on a VPS or through the [official website](https://nodejs.org/).
2. Install this package:
    ```
    npm install -g steam-hour-farmer
    ```
3. Make a directory somewhere. This is where your Steam data will be stored, and where you can configure the bot.
4. Find your Steam game ids. In each game, go to Properties -> Updates -> Copy the App ID.
5. In this directory, make an `.env` file with the content:

    ```sh
    ACCOUNT_NAME="your_steam_username"
    PASSWORD="your_steam_password"
    GAMES="440,4000"
    ```

    This will start playing Team Fortress 2 and Garry's Mod for example.

    The `GAMES` part of the file describes what games you'd like the bot to play, separated by a comma.

    Additionally, a `PERSONA` value may be supplied to set the online status of the user. Can be Online (1), Busy (2), Away (3), Snooze (4). For example,

    ```sh
    PERSONA="1"
    ```

    to be Online. Do not write this value if you don't want the user's presence to change.

    All of this configuration can be passed via environment variables too - they don't need to be in this `.env` file.

6. Run the program in the same directory:

    ```
    steam-hour-farmer
    ```

> [!TIP]
> If you have access to your Steam Shared Secret (using something like [SteamDesktopAuthenticator](https://github.com/Jessecar96/SteamDesktopAuthenticator)), you can input it into a `SHARED_SECRET` variable like so:
>
> ```sh
> SHARED_SECRET="xxxxxxxxxx"
> ```
>
> This will prevent you from needing to input your Steam Guard code at all, and will allow the bot to reconnect without any manual intervention.

When the bot starts, it will request a Steam Guard code via email or the mobile application. When you start playing on another machine, the bot will be kicked from its session, requiring a re-login, with a new Steam Guard code.

This can be remedied by using the Steam Shared Secret, or disabling Steam Guard.

Note that the playtime might seem to be the same when looking from another client - it can take a couple hours for Steam to refresh it sometimes.
