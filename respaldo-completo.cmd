@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo  Inversiones del Caribe - Respaldo COMPLETO
echo  (estructura + datos, restaurable en cualquier Postgres)
echo ============================================
echo.
echo Este respaldo usa la CLI de Supabase (via npx).
echo Necesitas la CADENA DE CONEXION de tu base:
echo   Supabase - Project Settings - Database - Connection string - URI
echo   (marca "Use connection pooling" NO; usa la directa. Reemplaza [YOUR-PASSWORD])
echo.

set /p DBURL=Pega aqui la cadena de conexion (postgresql://...):

if "%DBURL%"=="" (
  echo No ingresaste una cadena de conexion. Cancelado.
  pause
  exit /b 1
)

for /f "tokens=1-3 delims=/: " %%a in ('echo %date%') do set FECHA=%%c-%%b-%%a
set OUT=respaldo-IC-%FECHA%.sql

echo.
echo Generando respaldo en: %OUT%
echo (esto puede tardar un momento)
echo.

call npx --yes supabase db dump --db-url "%DBURL%" -f "%OUT%"
if errorlevel 1 (
  echo.
  echo Fallo el volcado de estructura. Revisa la cadena de conexion.
  pause
  exit /b 1
)

call npx --yes supabase db dump --db-url "%DBURL%" --data-only -f "datos-%OUT%"
if errorlevel 1 (
  echo.
  echo Fallo el volcado de datos.
  pause
  exit /b 1
)

echo.
echo ============================================
echo  LISTO. Se generaron:
echo   %OUT%          (estructura de la base)
echo   datos-%OUT%    (todos los datos)
echo.
echo  Guarda AMBOS archivos en Google Drive u OneDrive.
echo  Para restaurar en una base nueva: primero la estructura, luego los datos.
echo ============================================
pause
