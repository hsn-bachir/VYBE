Start-Process powershell `
    -ArgumentList "-Command `"cd backend; php artisan serve --host=localhost --port=8000`"" `
    # -WindowStyle Hidden


Start-Process powershell `
    -ArgumentList "-Command `"cd frontend; npm run dev`"" `
    # -WindowStyle Hidden

Start-Process powershell `
    -ArgumentList "-Command `"cd services/movie-catalog; php artisan serve --host=localhost --port=8001`"" `
    # -WindowStyle Hidden

Start-Sleep -Seconds 3

Start-Process "http://localhost:5173/"
