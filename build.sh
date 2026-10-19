#!/usr/bin/env bash
set -euo pipefail

# Render build command. Install Arduino CLI locally so the service doesn't
# depend on a preinstalled binary or write into a hard-coded system directory.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$ROOT/bin"
DATA_DIR="$ROOT/.arduino"
mkdir -p "$BIN_DIR" "$DATA_DIR"
export PATH="$BIN_DIR:$PATH"
export ARDUINO_DATA_DIR="$DATA_DIR"

if ! command -v arduino-cli >/dev/null 2>&1; then
  curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR="$BIN_DIR" sh -s 1.5.1
fi

arduino-cli config init --overwrite
arduino-cli config set directories.data "$DATA_DIR"
arduino-cli config set directories.user "$DATA_DIR"
arduino-cli core update-index
arduino-cli core install arduino:avr
arduino-cli lib update-index
arduino-cli lib install Servo
arduino-cli lib install "Adafruit BusIO"
arduino-cli lib install "Adafruit GFX Library"
arduino-cli lib install "Adafruit SSD1306"

printf '\nArduino CLI: '; arduino-cli version
printf '\nInstalled cores:\n'; arduino-cli core list
printf '\nInstalled libraries:\n'; arduino-cli lib list
printf '\nBuild environment ready.\n'
