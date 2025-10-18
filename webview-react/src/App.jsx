import React, { useState, useEffect } from 'react';
import './App.css';

// VS Code API 획득
const vscode = window.vscode || (typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null);

function App() {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingSteps, setProcessingSteps] = useState([]);
    const [autoCorrecting, setAutoCorrecting] = useState(false);

    // VS Code 메시지 리스너
    useEffect(() => {
        const handleMessage = (event) => {
            const message = event.data;

            switch (message.command) {
                case 'displayUserMessage':
                    setMessages(prev => [...prev, {
                        type: 'user',
                        content: message.content,
                        timestamp: new Date().toLocaleTimeString()
                    }]);
                    break;

                case 'displayAiMessage':
                    setMessages(prev => [...prev, {
                        type: 'ai',
                        content: message.content,
                        timestamp: new Date().toLocaleTimeString()
                    }]);
                    break;

                case 'setProcessingStep':
                    setProcessingSteps(prev => [...prev, {
                        step: message.step,
                        status: 'processing'
                    }]);
                    break;

                case 'updateProcessingStatus':
                    if (message.step === 'error_correction') {
                        if (message.status.includes('자동 오류 수정') || message.status.includes('오류 수정')) {
                            setAutoCorrecting(true);
                        } else if (message.status.includes('완료') || message.status.includes('실패')) {
                            setAutoCorrecting(false);
                        }
                    }
                    break;

                case 'showLoading':
                    setIsProcessing(true);
                    break;

                case 'hideLoading':
                    setIsProcessing(false);
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleSendMessage = () => {
        if (!inputValue.trim()) return;

        if (vscode) {
            vscode.postMessage({
                command: 'sendMessage',
                message: inputValue
            });
        }

        setInputValue('');
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (
        <div className="app">
            {/* Auto Correcting Indicator */}
            {autoCorrecting && (
                <div className="auto-correcting-indicator">
                    <div className="auto-correcting-content">
                        <div className="auto-correcting-spinner"></div>
                        <span className="auto-correcting-text">Auto Correcting...</span>
                    </div>
                </div>
            )}

            {/* Processing Steps */}
            {isProcessing && (
                <div className="processing-steps">
                    <div className="processing-step">
                        <div className="step-indicator"></div>
                        <div>
                            <div className="step-text">Error Correction</div>
                            <div className="step-description">Processing...</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Chat Messages */}
            <div className="chat-container">
                <div className="chat-messages">
                    {messages.map((message, index) => (
                        <div key={index} className={`message ${message.type}`}>
                            <div className="message-content">
                                {message.content}
                            </div>
                            <div className="message-timestamp">
                                {message.timestamp}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Input Area */}
            <div className="input-area">
                <div className="input-container">
                    <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="메시지를 입력하세요..."
                        className="message-input"
                        rows="3"
                    />
                    <button
                        onClick={handleSendMessage}
                        className="send-button"
                        disabled={!inputValue.trim()}
                    >
                        전송
                    </button>
                </div>
            </div>
        </div>
    );
}

export default App;
