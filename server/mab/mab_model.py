from mabwiser.mab import MAB, LearningPolicy
import os
import pickle
import json
import numpy as np
from collections import Counter, defaultdict
import random

# -------------------------
# Arms (difficulty levels)
# -------------------------
arms = ['1', '2', '3', '4', '5']
MODEL_DIR = "bandit_models"

MIN_EXPLORATION = 3
EXPLOIT_PROB = 0.7
MIN_SAMPLES_FOR_EXPLOIT = 3

# -------------------------
# Paths
# -------------------------
def get_model_path(student_id):
    return f"{MODEL_DIR}/{student_id}.pkl"

def get_history_path(student_id):
    return f"{MODEL_DIR}/{student_id}_history.json"

# -------------------------
# History
# -------------------------
def load_history(student_id):
    os.makedirs(MODEL_DIR, exist_ok=True)
    path = get_history_path(student_id)

    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)

    return {"decisions": [], "rewards": []}

# -------------------------
# Model
# -------------------------
def load_model(student_id):
    os.makedirs(MODEL_DIR, exist_ok=True)
    path = get_model_path(student_id)

    if os.path.exists(path):
        with open(path, "rb") as f:
            return pickle.load(f)

    return MAB(
        arms,
        learning_policy=LearningPolicy.EpsilonGreedy(epsilon=0.1)
    )

def save_model(bandit, student_id):
    with open(get_model_path(student_id), "wb") as f:
        pickle.dump(bandit, f)

# -------------------------
# Predict next difficulty
# -------------------------
def get_next_difficulty(student_id):
    history = load_history(student_id)

    decisions = np.array(history["decisions"], dtype=str)
    rewards = np.array(history["rewards"], dtype=int)

    arm_counts = Counter(decisions)
    print(f"\n[DEBUG] Student {student_id} arm counts → {arm_counts}")

    # 1️⃣ Initial Exploration
    under_sampled = [arm for arm in arms if arm_counts.get(arm, 0) < MIN_EXPLORATION]
    print(f"[DEBUG] Under-sampled arms → {under_sampled}")

    if under_sampled:
        chosen = random.choice(under_sampled)
        print(f"[EXPLORE - INITIAL] Choosing under-sampled difficulty → {chosen}")
        return chosen

    # 2️⃣ Bayesian Mean Calculation
    rewards_per_arm = defaultdict(list)
    for d, r in zip(decisions, rewards):
        rewards_per_arm[d].append(r)

    best_arms = []
    best_mean = -1

    print("\n[DEBUG] Beta Mean per arm:")
    for arm in arms:
        samples = rewards_per_arm[arm]
        if len(samples) >= MIN_SAMPLES_FOR_EXPLOIT:
            a = sum(samples) + 1
            b = len(samples) - sum(samples) + 1
            mean = a / (a + b)

            print(f"  Arm {arm} → samples={len(samples)}, mean={mean:.3f}")

            if mean > best_mean:
                best_mean = mean
                best_arms = [arm]
            elif mean == best_mean:
                best_arms.append(arm)
        else:
            print(f"  Arm {arm} → insufficient samples ({len(samples)})")

    if not best_arms:
        chosen = random.choice(arms)
        print(f"[FALLBACK] No confident arm → random choice {chosen}")
        return chosen

    print(f"[DEBUG] Best arms → {best_arms} (mean={best_mean:.3f})")

    # 3️⃣ Exploit vs Explore
    if random.random() < EXPLOIT_PROB:
        chosen = max(best_arms, key=int)
        print(f"[EXPLOIT] Choosing best difficulty → {chosen}")
        return chosen

    explore_arms = [arm for arm in arms if arm not in best_arms]
    chosen = random.choice(explore_arms) if explore_arms else random.choice(arms)
    print(f"[EXPLORE] Exploring non-best difficulty → {chosen}")
    return chosen

# -------------------------
# Update bandit (per student)
# -------------------------
def update_bandit(student_id, decision, reward):
    if decision is None or reward is None:
        print("[WARN] Invalid bandit update skipped")
        return

    decision = str(decision)
    reward = int(reward)

    print(f"[MAB UPDATE] decision={decision}, reward={reward}")

    bandit = load_model(student_id)
    bandit.partial_fit(
        np.array([decision]),
        np.array([reward])
    )
    save_model(bandit, student_id)

    history = load_history(student_id)
    history["decisions"].append(decision)
    history["rewards"].append(reward)

    with open(get_history_path(student_id), "w") as f:
        json.dump(history, f)

    print("[MAB UPDATE] History updated successfully")

def reset_bandit(student_id):
    pkl_path = os.path.join(MODEL_DIR, f"{student_id}.pkl")
    json_path = os.path.join(MODEL_DIR, f"{student_id}.json")

    if os.path.exists(pkl_path):
        os.remove(pkl_path)

    if os.path.exists(json_path):
        os.remove(json_path)
