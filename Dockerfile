FROM python:3.11-slim

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download NLTK data for TextBlob
RUN python -c "import nltk; nltk.download('punkt_tab', quiet=True); nltk.download('averaged_perceptron_tagger_eng', quiet=True)"

# Copy application code
COPY ml_service/ ./ml_service/
COPY api/ ./api/

EXPOSE 8000

CMD ["uvicorn", "api.index:app", "--host", "0.0.0.0", "--port", "8000"]
