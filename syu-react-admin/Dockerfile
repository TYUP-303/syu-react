# Use the official Python image
# 3.9는 requirements와 호환되지 않는다 — python-dotenv 1.2.2가 >=3.10을
# 요구해 빌드가 깨진다(2026-08-13 로컬 빌드 검증에서 확인). 로컬 venv와
# 같은 3.13으로 맞춘다.
FROM python:3.13-slim

# Set the working directory
WORKDIR /app

# Copy the requirements file
COPY requirements.txt .

# Install the required packages
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY . .

# Expose the Streamlit port
EXPOSE 8501

# Run the application
CMD ["streamlit", "run", "streamlit_app.py", "--server.port=8501", "--server.address=0.0.0.0"]
