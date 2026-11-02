@echo off
rem Atrium 실제 판 띄우기(P9). 바탕화면 바로가기가 부른다(make-shortcut.ps1).
rem 바뀐 소스가 있으면 빌드하고 창을 띄운 뒤 이 콘솔은 닫힌다. 실패하면 까닭을 보이도록 멈춘다
chcp 65001 >nul
node "%~dp0real.mjs" %*
if errorlevel 1 pause
