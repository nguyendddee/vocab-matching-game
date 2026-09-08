window.VocabApp = window.VocabApp || {};

window.VocabApp.Speech = (function() {
    function isSpeechSupported() {
        return 'speechSynthesis' in window;
    }

    function pronounce(word) {
        if (!isSpeechSupported()) return;

        // Cancel ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(word);
        utterance.lang = 'en-US';
        utterance.rate = 0.85;

        window.speechSynthesis.speak(utterance);
    }

    return {
        isSpeechSupported,
        pronounce
    };
})();
