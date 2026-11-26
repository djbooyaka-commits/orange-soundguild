@echo off
title OSG Spotify Helper
cd /d "%~dp0"
python -m pip install --quiet --user pyautogui pyperclip pygetwindow
python osg_spotify_helper.py
pause
