@echo off
cd /d "%~dp0"
echo ============================================
echo  Inversiones del Caribe - Iniciar sistema
echo ============================================
echo.

if exist node_modules goto :deps_ok
echo Instalando dependencias por primera vez...
call npm install
if errorlevel 1 goto :install_error
:deps_ok

echo Limpiando cache de Vite para evitar version vieja...
if exist "node_modules\.vite" rmdir /s /q "node_modules\.vite"
echo.
echo Iniciando el servidor...
echo Abre en el navegador: http://127.0.0.1:5173
echo Para detener: Ctrl + C
echo.
call npm run dev
echo.
echo El servidor se detuvo.
pause
exit /b 0

:install_error
echo.
echo ERROR al instalar las dependencias. Revisa tu conexion a internet.
pause
exit /b 1
