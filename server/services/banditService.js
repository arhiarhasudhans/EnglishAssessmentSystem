const axios = require("axios");

const MAB_BASE_URL = process.env.MAB_BASE_URL;

if (!MAB_BASE_URL) {
  throw new Error("MAB_BASE_URL is not defined");
}

module.exports = {
    getNextDifficulty: async (studentId) => {
        const res = await axios.get(`${MAB_BASE_URL}/question/next`, {
            params: { student_id: studentId } 
        });
        return res.data.next_difficulty;
    },

    submitToBandit: async (studentId, difficulty, reward) => {
        return axios.post(`${MAB_BASE_URL}/answer`, {
            student_id: studentId,       
            decision: difficulty.toString(),
            reward: reward
        });
    },

    resetBandit: async (studentId) => {
        try {
            await axios.post(`${MAB_BASE_URL}/reset`, {
            student_id: studentId
            });
        } catch (err) {
            console.error("Bandit reset failed:", err.message);
        }
    }
};  
