class QuizHandler {
    constructor() {
        this.assessmentData = null;
        this.currentQuestionIndex = 0;
        this.userAnswers = [];
        this.timeLeft = 0;
        this.timer = null;
        this.studentId = null;
        this.assessmentId = null;
    }

    // Initialize quiz
    async init() {
        try {
            // Get student and assessment data from session storage
            const sessionData = JSON.parse(sessionStorage.getItem('quizSession'));
            
            if (!sessionData || !sessionData.student || !sessionData.assessment) {
                alert('No active quiz session found');
                window.location.href = '/student/login.html';
                return;
            }

            this.studentId = sessionData.student.id;
            this.assessmentId = sessionData.assessment.id;
            
            // Display student info
            document.getElementById('student-name').textContent = sessionData.student.fullName;
            document.getElementById('student-id').textContent = sessionData.student.studentId;
            
            // Fetch assessment questions
            const response = await fetch(`/api/assessment/${this.assessmentId}/questions?studentId=${sessionData.student.studentId}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch questions');
            }
            
            const data = await response.json();
            this.assessmentData = data;
            
            // Set up timer
            this.timeLeft = data.duration * 60; // Convert minutes to seconds
            this.startTimer();
            
            // Initialize user answers array
            this.userAnswers = Array(data.questions.length).fill(null);
            
            // Display assessment title
            document.getElementById('assessment-title').textContent = data.assessmentTitle;
            document.getElementById('total-questions').textContent = data.questions.length;
            
            // Show first question
            this.showQuestion(0);
            
            // Set up navigation buttons
            document.getElementById('prev-btn').addEventListener('click', () => this.prevQuestion());
            document.getElementById('next-btn').addEventListener('click', () => this.nextQuestion());
            document.getElementById('submit-btn').addEventListener('click', () => this.submitQuiz());
            
            // Initialize question navigation
            this.updateQuestionNav();
            
        } catch (error) {
            console.error('Error initializing quiz:', error);
            alert(error.message || 'Failed to load quiz');
        }
    }

    // Start timer
    startTimer() {
        const timerDisplay = document.getElementById('timer');
        
        this.timer = setInterval(() => {
            this.timeLeft--;
            
            // Format time as MM:SS
            const minutes = Math.floor(this.timeLeft / 60);
            const seconds = this.timeLeft % 60;
            timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            // If time is up, submit quiz automatically
            if (this.timeLeft <= 0) {
                clearInterval(this.timer);
                alert('Time is up! Your quiz will be submitted.');
                this.submitQuiz();
            }
            
            // Warning when 5 minutes left
            if (this.timeLeft === 300) {
                alert('5 minutes remaining!');
            }
            
        }, 1000);
    }

    // Show question by index
    showQuestion(index) {
        const question = this.assessmentData.questions[index];
        const questionContainer = document.getElementById('question-container');
        
        // Update question number
        document.getElementById('current-question').textContent = index + 1;
        
        // Build question HTML
        let questionHTML = `
            <div class="question">
                <h3>Question ${index + 1}</h3>
                <p class="question-text">${question.text}</p>
        `;
        
        // Add options based on question type
        if (question.type === 'mcq') {
            questionHTML += '<div class="options">';
            
            question.options.forEach((option, optIndex) => {
                const isChecked = this.userAnswers[index] === optIndex ? 'checked' : '';
                questionHTML += `
                    <div class="option">
                        <input type="radio" id="option-${optIndex}" name="question-${index}" value="${optIndex}" ${isChecked}>
                        <label for="option-${optIndex}">${option}</label>
                    </div>
                `;
            });
            
            questionHTML += '</div>';
        } else {
            // Fill in the blank
            questionHTML += `
                <div class="fill-blank">
                    <input type="text" class="fill-blank-input" placeholder="Your answer" value="${this.userAnswers[index] || ''}">
                </div>
            `;
        }
        
        questionHTML += '</div>';
        questionContainer.innerHTML = questionHTML;
        
        // Add event listeners to record answers
        if (question.type === 'mcq') {
            const options = document.querySelectorAll(`input[name="question-${index}"]`);
            options.forEach(option => {
                option.addEventListener('change', (e) => {
                    this.userAnswers[index] = parseInt(e.target.value);
                    this.updateQuestionNav();
                });
            });
        } else {
            const input = document.querySelector('.fill-blank-input');
            input.addEventListener('input', (e) => {
                this.userAnswers[index] = e.target.value.trim();
                this.updateQuestionNav();
            });
        }
        
        // Update navigation buttons
        this.currentQuestionIndex = index;
        this.updateNavButtons();
    }

    // Update navigation buttons
    updateNavButtons() {
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const submitBtn = document.getElementById('submit-btn');
        
        // Show/hide previous button
        prevBtn.style.display = this.currentQuestionIndex > 0 ? 'block' : 'none';
        
        // Show/hide next button
        nextBtn.style.display = this.currentQuestionIndex < this.assessmentData.questions.length - 1 ? 'block' : 'none';
        
        // Show/hide submit button
        submitBtn.style.display = this.currentQuestionIndex === this.assessmentData.questions.length - 1 ? 'block' : 'none';
    }

    // Update question navigation dots
    updateQuestionNav() {
        const questionNav = document.getElementById('question-nav');
        questionNav.innerHTML = '';
        
        this.assessmentData.questions.forEach((_, index) => {
            const dot = document.createElement('div');
            dot.className = 'question-dot';
            
            if (index === this.currentQuestionIndex) {
                dot.classList.add('current');
            }
            
            if (this.userAnswers[index] !== null) {
                dot.classList.add('answered');
            }
            
            dot.addEventListener('click', () => this.showQuestion(index));
            questionNav.appendChild(dot);
        });
    }

    // Go to previous question
    prevQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.showQuestion(this.currentQuestionIndex - 1);
        }
    }

    // Go to next question
    nextQuestion() {
        if (this.currentQuestionIndex < this.assessmentData.questions.length - 1) {
            this.showQuestion(this.currentQuestionIndex + 1);
        }
    }

    // Submit quiz
    async submitQuiz() {
        try {
            // Confirm submission
            const unansweredCount = this.userAnswers.filter(answer => answer === null).length;
            
            if (unansweredCount > 0) {
                const confirmSubmit = confirm(`You have ${unansweredCount} unanswered questions. Are you sure you want to submit?`);
                if (!confirmSubmit) return;
            }
            
            // Stop timer
            clearInterval(this.timer);
            
            // Prepare answers for submission
            const formattedAnswers = this.userAnswers.map((answer, index) => {
                return {
                    questionId: this.assessmentData.questions[index].id,
                    selectedOption: answer
                };
            });
            
            // Calculate time spent (original duration minus time left)
            const timeSpent = (this.assessmentData.duration * 60) - this.timeLeft;
            
            // Submit answers
            const response = await fetch('/api/assessment/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    studentId: this.studentId,
                    assessmentId: this.assessmentId,
                    answers: formattedAnswers,
                    timeSpent: timeSpent
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to submit quiz');
            }
            
            const result = await response.json();
            
            // Store result in session storage
            sessionStorage.setItem('quizResult', JSON.stringify(result.result));
            
            // Redirect to results page
            window.location.href = '/student/results.html';
            
        } catch (error) {
            console.error('Error submitting quiz:', error);
            alert(error.message || 'Failed to submit quiz');
        }
    }
}

// Initialize quiz when page loads
document.addEventListener('DOMContentLoaded', () => {
    const quiz = new QuizHandler();
    quiz.init();
});