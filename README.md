# Technical Assessment Web App

A simple full-stack assessment project with:

- React frontend
- Python FastAPI backend
- MongoDB database
- Registration and login
- Protected dashboard
- CRUD operations
- Client and server-side validation

## Project Structure

```text
backend/
  main.py
  requirements.txt
frontend/
  src/
  package.json
render.yaml
```

## Local Setup

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --reload
```

Update `backend/.env` with your MongoDB connection string.

### Frontend

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:5173`.

## Render Deployment

1. Push this project to GitHub.
2. Create a MongoDB Atlas database and copy the connection string.
3. On Render, create the backend as a Python Web Service.
4. Add backend environment variables:
   - `MONGODB_URI`
   - `DATABASE_NAME`
   - `JWT_SECRET`
   - `FRONTEND_ORIGIN`
5. Create the frontend as a Static Site.
6. Add frontend environment variable:
   - `VITE_API_URL=https://your-backend-service.onrender.com`
7. After deployment, share 