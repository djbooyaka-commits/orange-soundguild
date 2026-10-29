@echo off
title OSG PC Remote
cd /d "%~dp0"
python -m pip install --quiet --user mss pillow pyautogui requests
python osg_pc_remote.py
pause
