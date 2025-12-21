# difficulty_classifier.py
import joblib
import json
import sys
import re
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
import nltk

# This robust check is kept for portability, but the manual download is the key fix.
try:
    nltk.data.find('tokenizers/punkt')
    nltk.data.find('corpora/stopwords')
except LookupError:
    # This will now output a clear error to the Node.js logs if the data is missing.
    error_msg = {"error": "CRITICAL: NLTK data (punkt/stopwords) not found. Please run the manual NLTK download process."}
    print(json.dumps(error_msg))
    sys.exit(1)

# Define file paths for the saved model and vectorizer
MODEL_PATH = 'difficulty_model.pkl'
VECTORIZER_PATH = 'tfidf_vectorizer.pkl'

def load_model_and_vectorizer():
    """
    Loads the pre-trained TF-IDF vectorizer and Logistic Regression model.
    """
    try:
        vectorizer = joblib.load(VECTORIZER_PATH)
        model = joblib.load(MODEL_PATH)
        return vectorizer, model
    except FileNotFoundError:
        print(json.dumps({"error": "Model or vectorizer file not found. Ensure 'train_difficulty_model.py' has been run."}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Error loading model components: {e}"}))
        sys.exit(1)

def preprocess_text_for_prediction(text):
    """
    Cleans and preprocesses the input text, identical to the training script.
    """
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)
    tokens = word_tokenize(text)
    stop_words = set(stopwords.words('english'))
    filtered_tokens = [word for word in tokens if word not in stop_words]
    return " ".join(filtered_tokens)

def predict_difficulty(question_text, vectorizer, model):
    """
    Predicts the difficulty of a single question using the loaded model.
    """
    processed_question = preprocess_text_for_prediction(question_text)
    question_vec = vectorizer.transform([processed_question])
    difficulty = model.predict(question_vec)[0]
    return difficulty

if __name__ == "__main__":
    vectorizer, model = load_model_and_vectorizer()
    try:
        input_json = sys.stdin.read()
        data = json.loads(input_json)
        question = data.get("question")
        if not question:
            print(json.dumps({"error": "Missing 'question' in input JSON."}))
            sys.exit(1)
        predicted_difficulty = predict_difficulty(question, vectorizer, model)
        print(json.dumps({"difficulty": predicted_difficulty}))
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON input."}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"An unexpected error occurred: {e}"}))
        sys.exit(1)