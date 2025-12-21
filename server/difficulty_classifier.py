# difficulty_classifier.py
import sys
import json
import pickle
import os
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier

# Load model and vectorizer
MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'difficulty_model.pkl')
VECTORIZER_PATH = os.path.join(os.path.dirname(__file__), '..', 'tfidf_vectorizer.pkl')

def classify_questions(questions):
    try:
        # Load artifacts
        with open(MODEL_PATH, 'rb') as f:
            model = pickle.load(f)
        with open(VECTORIZER_PATH, 'rb') as f:
            vectorizer = pickle.load(f)

        results = []
        texts = [q['text'] for q in questions]
        
        # Transform and Predict
        features = vectorizer.transform(texts)
        predictions = model.predict(features)
        
        for i, pred in enumerate(predictions):
            results.append({
                'topic': 'General Grammar', # Simplified
                'difficulty': int(pred)
            })
            
        return results

    except Exception as e:
        # Fallback
        return [{'topic': 'General Grammar', 'difficulty': 3} for _ in questions]

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        if not input_data:
            sys.exit(0)
            
        data = json.loads(input_data)
        questions = data.get('questions', [])
        
        results = classify_questions(questions)
        print(json.dumps(results))
    except Exception as e:
        print(json.dumps([]))
