const banditService = require("../services/banditService");

exports.submitAnswer = async (req, res) => {
  try {
    const {
      student_id,
      assessment_id,
      question_id,
      selected_option
    } = req.body;

    if (!student_id || !assessment_id || !question_id) {
      return res.status(400).json({ error: "Missing data" });
    }

    // STUDENT UUID
    const studentResult = await req.pool.query(
      "SELECT id FROM students WHERE student_id = $1",
      [student_id]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }

    const studentUUID = studentResult.rows[0].id;

    // PREVENT ANSWER AFTER COMPLETION
    const statusCheck = await req.pool.query(
      `
      SELECT completed, answers
      FROM student_assessments
      WHERE student_id = $1 AND assessment_id = $2
      `,
      [studentUUID, assessment_id]
    );

    if (statusCheck.rows[0]?.completed) {
      return res.status(403).json({ error: "Assessment completed" });
    }

    // PREVENT DUPLICATE ANSWER
    const alreadyAnswered = (statusCheck.rows[0]?.answers || [])
      .some(a => a.question_id === question_id);

    if (alreadyAnswered) {
      return res.status(409).json({ error: "Question already answered" });
    }

    // GET ASSESSMENT
    const assessmentResult = await req.pool.query(
      "SELECT questions FROM assessments WHERE id = $1",
      [assessment_id]
    );

    if (assessmentResult.rows.length === 0) {
      return res.status(404).json({ error: "Assessment not found" });
    }

    const question = assessmentResult.rows[0].questions
      .find(q => q.id === question_id);

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    const isCorrect = Number(question.correctAnswer) === Number(selected_option);

    // SAVE ANSWER
    await req.pool.query(
      `
      UPDATE student_assessments
      SET answers = answers || $1::jsonb
      WHERE student_id = $2 AND assessment_id = $3
      `,
      [
        JSON.stringify([{
          question_id,
          selected_option,
          correct: isCorrect,
          difficulty: question.difficulty,
          answered_at: new Date().toISOString()
        }]),
        studentUUID,
        assessment_id
      ]
    );

    // UPDATE BANDIT
    await banditService.submitToBandit(
      studentUUID,
      question.difficulty,
      isCorrect
    );

    return res.json({ success: true, correct: isCorrect });

  } catch (err) {
    console.error("submitAnswer error:", err);
    res.status(500).json({ error: "Failed to submit answer" });
  }
};
