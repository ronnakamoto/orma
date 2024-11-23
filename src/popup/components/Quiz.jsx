import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { vectorService } from '../../services/vectorService';

const Quiz = ({ projectId, projectName, onClose }) => {
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedAnswer, setSelectedAnswer] = useState(null);

  useEffect(() => {
    const generateQuiz = async () => {
      setLoading(true);
      try {
        // Get project context and generate questions
        const projectContext = await vectorService.getProjectContext(projectId);
        const quizQuestions = await vectorService.generateQuizQuestions(projectContext);
        setQuestions(quizQuestions);
      } catch (error) {
        console.error('Failed to generate quiz:', error);
      }
      setLoading(false);
    };

    generateQuiz();
  }, [projectId]);

  const handleAnswerSelect = (answerIndex) => {
    if (selectedAnswer === null) { // Only allow selecting if no answer is selected
      setSelectedAnswer(answerIndex);
    }
  };

  const handleNextQuestion = () => {
    // Update score if answer is correct
    if (selectedAnswer === questions[currentQuestionIndex].correctAnswer) {
      setScore(prevScore => prevScore + 1);
    }

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prevIndex => prevIndex + 1);
      setSelectedAnswer(null); // Reset selected answer for next question
    } else {
      setShowResults(true);
    }
  };

  const handleRetry = () => {
    setCurrentQuestionIndex(0);
    setScore(0);
    setShowResults(false);
    setSelectedAnswer(null);
  };

  const QuestionCard = ({ question, answers, selectedAnswer, onSelect }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="question-card"
    >
      <h3 className="question-text">{question}</h3>
      <div className="answers-grid">
        {answers.map((answer, index) => (
          <motion.button
            key={index}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`answer-button ${selectedAnswer === index ? 'selected' : ''}`}
            onClick={() => onSelect(index)}
            disabled={selectedAnswer !== null} // Disable all options after selection
          >
            <span className="answer-label">{String.fromCharCode(65 + index)})</span>
            <span className="answer-text">{answer}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );

  const ResultsCard = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="results-card"
    >
      <h2>Quiz Complete!</h2>
      <div className="score-display">
        <div className="score-circle">
          <span className="score-number">{Math.round((score / questions.length) * 100)}%</span>
        </div>
        <p>You scored {score} out of {questions.length}</p>
      </div>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="retry-button"
        onClick={handleRetry}
      >
        Try Again
      </motion.button>
    </motion.div>
  );

  return (
    <div className="quiz-container">
      <div className="quiz-header">
        <h2>Project Knowledge Quiz</h2>
        <button className="close-button" onClick={onClose}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="quiz-content">
        {loading ? (
          <div className="loading-state">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="loading-spinner"
            />
            <p>Analyzing project and generating questions...</p>
          </div>
        ) : showResults ? (
          <ResultsCard />
        ) : (
          <>
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
              />
            </div>
            <AnimatePresence mode="wait">
              <QuestionCard
                key={currentQuestionIndex}
                question={questions[currentQuestionIndex]?.question}
                answers={questions[currentQuestionIndex]?.answers}
                selectedAnswer={selectedAnswer}
                onSelect={handleAnswerSelect}
              />
            </AnimatePresence>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="next-button"
              disabled={selectedAnswer === null}
              onClick={handleNextQuestion}
            >
              {currentQuestionIndex === questions.length - 1 ? 'Finish' : 'Next'}
            </motion.button>
          </>
        )}
      </div>
    </div>
  );
};

export default Quiz;
