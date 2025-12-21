# train_difficulty_model.py
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import joblib
import re
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
import nltk

# This robust check is kept for portability, but the manual download is the key fix.
try:
    nltk.data.find('tokenizers/punkt')
    nltk.data.find('corpora/stopwords')
except LookupError:
    print("CRITICAL: NLTK data not found. Please run the manual download steps.")
    # The script will exit if the manual download was not successful.
    sys.exit("Exiting: NLTK resources are essential for this script to run.")

def preprocess_text(text):
    """
    Cleans and preprocesses the input text.
    """
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)
    tokens = word_tokenize(text)
    stop_words = set(stopwords.words('english'))
    filtered_tokens = [word for word in tokens if word not in stop_words]
    return " ".join(filtered_tokens)

def create_english_grammar_vocabulary_dataset():
    """
    Creates a sample dataset of English grammar and vocabulary questions with difficulty labels.
    """
    data = {
        'question': [
            # Easy Grammar/Vocabulary
            "Choose the correct word: 'I have ___ apple.'", "Identify the verb in the sentence: 'She sings beautifully.'", "Which of these is a synonym for 'happy'?", "Complete the sentence: 'They ___ playing in the park.'", "What is the plural of 'cat'?", "Fill in the blank: 'He is ___ good student.'", "Which word means the opposite of 'cold'?", "Choose the correct pronoun: 'Give it to ___.' (I/me)", "What is a group of birds called?", "Identify the adjective: 'The tall tree.'", "Select the correct preposition: 'The book is ___ the table.'", "What is the past tense of 'go'?",
            # Medium Grammar/Vocabulary
            "Choose the grammatically correct sentence:", "Identify the dependent clause in: 'Although it was raining, we went for a walk.'", "Which word best completes the idiom: 'Bite the ___.' (bullet/dust/hand)", "Correct the sentence: 'Me and him went to the store.'", "What is the meaning of 'ubiquitous'?", "Distinguish between 'affect' and 'effect' in a sentence.", "Complete with the correct conditional: 'If I ___ a bird, I would fly.' (was/were)", "Choose the word that means 'a strong feeling of dislike': (antipathy/apathy/sympathy)", "Which sentence uses the present perfect continuous tense correctly?", "What is the correct use of the semicolon in a compound sentence?", "Explain the difference between 'imply' and 'infer'.", "Identify the error: 'Every one of the students have passed the exam.'",
            # Hard Grammar/Vocabulary
            "Analyze the nuanced difference between 'contemptuous' and 'contemptible'.", "Explain the concept of 'parallelism' in advanced sentence structure, providing an example.", "Which of the following is an example of an oxymoron?", "Rewrite the following sentence to correct a dangling participle: 'Having finished the assignment, the TV was turned on.'", "What is the precise meaning and appropriate usage of the word 'penultimate'?", "Discuss the historical evolution of the subjunctive mood in English and its contemporary usage.", "Identify and correct the specific logical fallacy in the statement: 'Every time I wear my lucky socks, my team wins. Therefore, my socks cause them to win.'", "Differentiate between 'disinterested' and 'uninterested', providing contexts where each is correctly used.", "Construct a complex-compound sentence using proper punctuation and demonstrating both a correlative conjunction and an appositive phrase.", "What is the term for a word formed from the first letters of other words and pronounced as a word itself (e.g., NASA)?", "Explain the grammatical concept of a 'fused participle' and illustrate with an example.", "Choose the best word for: 'His ___ remarks alienated many of his colleagues.' (laconic/acerbic/benign)"
        ],
        'difficulty': [
            'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy',
            'medium', 'medium', 'medium', 'medium', 'medium', 'medium', 'medium', 'medium', 'medium', 'medium', 'medium', 'medium',
            'hard', 'hard', 'hard', 'hard', 'hard', 'hard', 'hard', 'hard', 'hard', 'hard', 'hard', 'hard'
        ]
    }
    return pd.DataFrame(data)

def train_model(df):
    """
    Trains a Logistic Regression model with TF-IDF features.
    Saves the trained vectorizer and model using joblib.
    """
    print("Starting model training for English Grammar & Vocabulary...")
    df['processed_question'] = df['question'].apply(preprocess_text)
    X = df['processed_question']
    y = df['difficulty']
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    vectorizer = TfidfVectorizer(max_features=5000)
    X_train_vec = vectorizer.fit_transform(X_train)
    X_test_vec = vectorizer.transform(X_test)
    model = LogisticRegression(max_iter=1000, random_state=42)
    model.fit(X_train_vec, y_train)
    y_pred = model.predict(X_test_vec)
    accuracy = accuracy_score(y_test, y_pred)
    report = classification_report(y_test, y_pred)
    print(f"\n--- Model Training Results ---")
    print(f"Training Accuracy: {accuracy:.2f}")
    print("Classification Report:\n", report)
    print("----------------------------")
    joblib.dump(vectorizer, 'tfidf_vectorizer.pkl')
    joblib.dump(model, 'difficulty_model.pkl')
    print("\nVectorizer ('tfidf_vectorizer.pkl') and Model ('difficulty_model.pkl') saved successfully.")
    return model, vectorizer

if __name__ == "__main__":
    df_grammar_vocab = create_english_grammar_vocabulary_dataset()
    train_model(df_grammar_vocab)