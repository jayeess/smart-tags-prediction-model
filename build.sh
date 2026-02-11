#!/usr/bin/env bash
set -e

echo "==> Installing Python dependencies..."
pip install --no-cache-dir -r requirements.txt

echo "==> Downloading NLTK data for TextBlob..."
python -c "import nltk; nltk.download('punkt_tab', quiet=True); nltk.download('averaged_perceptron_tagger_eng', quiet=True)"

echo "==> Build complete."
