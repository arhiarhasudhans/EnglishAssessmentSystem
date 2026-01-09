from flask import Flask, request, jsonify
from mab_model import get_next_difficulty, update_bandit, reset_bandit

app = Flask(__name__)

@app.route("/question/next", methods=["GET"])
def next_question():
    student_id = request.args.get("student_id")

    if not student_id:
        return jsonify({"error": "student_id required"}), 400

    next_diff = get_next_difficulty(student_id)

    # SAFETY: always return int
    try:
        next_diff = int(next_diff)
    except Exception:
        next_diff = 3

    return jsonify({"next_difficulty": next_diff})


@app.route("/answer", methods=["POST"])   
def submit_answer():
    data = request.json or {}

    student_id = data.get("student_id")
    decision = data.get("decision")
    reward = data.get("reward")

    if not student_id:
        return jsonify({"error": "student_id required"}), 400

    try:
        decision = int(decision)
        reward = int(reward)
    except Exception:
        return jsonify({"error": "Invalid decision or reward"}), 400

    update_bandit(student_id, decision, reward)

    return jsonify({"status": "updated successfully!"})

@app.route("/reset", methods=["POST"])
def reset_bandit_api():
    data = request.json or {}
    student_id = data.get("student_id")

    if not student_id:
        return jsonify({"error": "student_id required"}), 400

    reset_bandit(student_id)

    return jsonify({"status": "bandit reset"})


if __name__ == "__main__":
    app.run(port=5000)
