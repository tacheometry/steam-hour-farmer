## Simple Steam Hour Farmer

_`steam-hour-farmer` is a program designed to emulate gameplay on Steam, allowing you to effortlessly accumulate playtime on specific games in your profile._

- **24/7 Deployment**: Can be easily deployed on a VPS for continuous operation.
- **Library-Only Requirement**: Only requires the games to be in your Steam library; installation is not necessary.
- **Automatic Pausing**: Automatically pauses when you start playing games on your main computer.
- **Seamless Resumption**: Resumes automatically after you finish playing, as long as it can log in again.
- **Multiple Accounts**: Supports farming on multiple steam accounts simultaneously.
- **Inspired by**: [@Gunthersuper/steam-idle-bot](https://github.com/Gunthersuper/steam-idle-bot).


## How to Use

### 1. Prerequisites

Ensure you have **Node.js v16 or higher** installed. You can download it from the [official website](https://nodejs.org/).

### 2. Installation

Install the package globally using npm:

```bash
npm install -g steam-hour-farmer
```

### 3. Setup Directory

Create a directory where your Steam data will be stored:

```bash
mkdir example-name/
```

### 4. Find Games App IDs

To find your Steam games App IDs:

1. Open Steam and go to your **Library**.
2. **Right-click** on a game you want to add to open the context menu.
3. Select **Properties** from the menu.
4. In the properties window, go to the **Updates** tab.
5. Copy the **App ID** listed there.

Alternatively, you can use [SteamDB](https://steamdb.info/) to look up the games App IDs.

### 5. Configuration

In your created directory, create a file named `.env` with the following content:

```sh
[STEAM_ACCOUNT]
ACCOUNT_NAME="your_steam_username"
PASSWORD="your_steam_password"
GAMES="730,440"
PERSONA="1"

[STEAM_ACCOUNT]
ACCOUNT_NAME="your_steam_username_2"
PASSWORD="your_steam_password_2"
GAMES="730,440"
PERSONA="2"
```

The `GAMES` variable should list the App IDs of the games you want the program to emulate playing, separated by commas. This example will start emulating playtime for **CS2** and **Team Fortress 2**. You can also include non-Steam game names, like this:

```sh
GAMES="Hello World,730,440"
```

You can set the user's online status with the `PERSONA` variable. Possible values are:
- **Online (1)**
- **Busy (2)**
- **Away (3)**
- **Snooze (4)**

For example, to set your status to Online:

```sh
PERSONA="1"
```

### 6. Running the Program

Execute the program in the same directory:

```bash
steam-hour-farmer
```

#### Automating Login

When the bot starts, it will request a Steam Guard code via email or mobile app. If you start playing on another machine, the bot will be logged out and will require a new Steam Guard code to log back in.

Using the Steam Shared Secret or disabling Steam Guard can help avoid this issue. Note that playtime may not update immediately on other clients; it can take a few hours for Steam to refresh the data.

To get your Steam Shared Secret, you can use [steamguard-cli](https://github.com/dyc3/steamguard-cli). Learn how to install it with their [quickstart guide](https://github.com/dyc3/steamguard-cli/blob/master/docs/quickstart.md).

Once installed, you can run this command to add your Steam account. It will ask you for your Steam account name, password, and a Steam Guard code sent to your email:

```bash
steamguard setup
```

Once run, it will generate a `maFiles/` directory:
- **Linux**: `~/.config/steamguard-cli/maFiles/`
- **Windows**: `%APPDATA%\steamguard-cli\maFiles\`

Go into the directory and read the file that ends with `.maFile`. Look for `"shared_secret":` and copy the value. Now go to your `.env` file and paste the value into the `SHARED_SECRET`:

```sh
SHARED_SECRET="your_shared_secret"
```

This will eliminate the need for manual Steam Guard code input and allow the program to reconnect automatically.

## Running in the Background

To run the program in the background, you can choose from several methods:

- **[PM2](https://pm2.keymetrics.io/)**: A popular process manager for Node.js applications.
- **[GNU Screen](https://wiki.archlinux.org/title/GNU_Screen)**: Use this terminal multiplexer to keep the bot running.
- **Systemd Service**: Set up a service to execute the program within a Linux environment.

  ```bash
  sudo nano /etc/systemd/system/steam-farming.service
  ```
  ```ini
    [Unit]
    Description=Steam Hour Farmer for [your_steam_username] Steam account
    After=network.target

    [Service]
    Type=simple
    WorkingDirectory=/home/my-user/example-name
    ExecStart=/usr/bin/steam-hour-farmer

    [Install]
    WantedBy=multi-user.target
    ```
    ```bash
    sudo systemctl start steam-farming.service
    ```
