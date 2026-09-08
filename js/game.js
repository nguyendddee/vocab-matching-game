window.VocabApp = window.VocabApp || {};

window.VocabApp.Game = (function() {
    // Fisher-Yates shuffle
    function shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    class GameEngine {
        constructor(vocabData) {
            this.vocabData = vocabData;
            this.currentRound = null;
            this.lastRoundWordIds = [];
        }

        startRound(count = 50) {
            // 1. Get words due for spaced repetition review
            const dueWords = window.VocabApp.Spaced ? window.VocabApp.Spaced.getWordsForReview(this.vocabData.vocabulary) : [];
            
            // 2. Get new words (ordered by JSON which is exactly frequency/popularity order)
            const newWords = this.vocabData.vocabulary.filter(w => w.status === 'new' || !w.status);
            
            // 3. Get words in learning but not yet due
            const learningWords = this.vocabData.vocabulary.filter(w => 
                w.status === 'learning' && !dueWords.some(d => d.id === w.id)
            );

            // Prioritize: Due reviews -> Most common new words -> Other learning words
            const candidatePool = [...dueWords, ...newWords, ...learningWords];
            
            // Take exactly the requested count from the top of the pool
            const selectedWords = candidatePool.slice(0, count);

            // Save word IDs for replay
            this.lastRoundWordIds = selectedWords.map(w => w.id);

            return this._buildRound(selectedWords);
        }

        replayRound() {
            if (!this.lastRoundWordIds || this.lastRoundWordIds.length === 0) return null;
            const selectedWords = this.lastRoundWordIds
                .map(id => this.vocabData.vocabulary.find(w => w.id === id))
                .filter(w => w != null);
            if (selectedWords.length === 0) return null;
            return this._buildRound(selectedWords);
        }

        _buildRound(selectedWords) {
            const viCards = selectedWords.map(w => ({
                id: w.id,
                text: w.meaning_vi
            }));

            const enCards = selectedWords.map(w => ({
                id: w.id,
                word: w.word,
                ipa: w.ipa,
                definition: w.definition
            }));

            this.currentRound = {
                pairs: selectedWords,
                viCards: shuffleArray(viCards),
                enCards: shuffleArray(enCards),
                matched: new Set(),
                selectedEN: null,
                selectedVI: null,
                score: 0,
                total: selectedWords.length,
                attempts: 0
            };

            return this.currentRound;
        }

        selectCard(side, index) {
            if (!this.currentRound) return null;

            if (side === 'en') {
                this.currentRound.selectedEN = index;
            } else if (side === 'vi') {
                this.currentRound.selectedVI = index;
            }

            if (this.currentRound.selectedEN !== null && this.currentRound.selectedVI !== null) {
                return this.checkMatch();
            }

            return null; // Not ready to check yet
        }

        checkMatch() {
            const enIndex = this.currentRound.selectedEN;
            const viIndex = this.currentRound.selectedVI;

            const enCard = this.currentRound.enCards[enIndex];
            const viCard = this.currentRound.viCards[viIndex];

            const isCorrect = enCard.id === viCard.id;
            
            this.currentRound.attempts++;

            if (isCorrect) {
                this.currentRound.matched.add(enCard.id);
                this.currentRound.score++;
            }

            const wordObj = this.currentRound.pairs.find(w => w.id === enCard.id);

            // Reset selections
            this.currentRound.selectedEN = null;
            this.currentRound.selectedVI = null;

            return {
                correct: isCorrect,
                enIndex,
                viIndex,
                word: wordObj
            };
        }

        isRoundComplete() {
            if (!this.currentRound) return false;
            return this.currentRound.matched.size === this.currentRound.total;
        }

        getRoundStats() {
            if (!this.currentRound) return null;
            
            const accuracy = this.currentRound.attempts === 0 ? 0 : 
                Math.round((this.currentRound.score / this.currentRound.attempts) * 100);
            
            return {
                score: this.currentRound.score,
                total: this.currentRound.total,
                accuracy: accuracy
            };
        }

        markAsMastered(wordId) {
            const word = this.vocabData.vocabulary.find(w => w.id === wordId);
            if (word) {
                word.status = 'mastered';
                word.mastered_at = new Date().toISOString();
            }
        }

        unmarkMastered(wordId) {
            const word = this.vocabData.vocabulary.find(w => w.id === wordId);
            if (word) {
                word.status = 'learning';
                word.mastered_at = null;
            }
        }

        getMasteredWords() {
            return this.vocabData.vocabulary.filter(w => w.status === 'mastered');
        }

        getAvailableWords() {
            return this.vocabData.vocabulary.filter(w => w.status !== 'mastered');
        }
    }

    return {
        GameEngine
    };
})();
