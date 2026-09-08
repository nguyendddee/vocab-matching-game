window.VocabApp = window.VocabApp || {};

window.VocabApp.App = (function() {
    const { Storage, Speech, Spaced, Game } = window.VocabApp;
    let vocabData = null;
    let gameEngine = null;
    let currentReviewWords = [];
    let currentReviewIndex = 0;

    // ── INIT ──────────────────────────────────────────────
    async function init() {
        vocabData = await Storage.loadVocab();
        gameEngine = new Game.GameEngine(vocabData);

        setupTabNavigation();
        setupGameControls();
        document.getElementById('toggle-definition').checked = vocabData.settings.show_definition || false;
        setupMasteredView();
        setupModal();

        startNewRound();
        updateStats();
    }

    // ── TAB NAVIGATION ────────────────────────────────────
    function setupTabNavigation() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(tabId).classList.add('active');

                if (tabId === 'view-review') renderReviewTab();
                if (tabId === 'view-mastered') renderMasteredTab();
                if (tabId === 'view-stats') updateStats();
            });
        });
    }

    // ── GAME CONTROLS ─────────────────────────────────────
    function setupGameControls() {
        document.getElementById('btn-new-round').addEventListener('click', startNewRound);
        document.getElementById('btn-replay').addEventListener('click', replayCurrentRound);

        document.getElementById('toggle-definition').addEventListener('change', (e) => {
            const defs = document.querySelectorAll('.card-definition');
            defs.forEach(d => {
                d.classList.toggle('hidden', !e.target.checked);
            });
            vocabData.settings.show_definition = e.target.checked;
            Storage.saveVocab(vocabData);
        });

        const wprInput = document.getElementById('wpr-input');
        if (wprInput) {
            wprInput.value = vocabData.settings.words_per_round || 50;
            wprInput.addEventListener('change', (e) => {
                let val = parseInt(e.target.value) || 10;
                if (val < 1) val = 1;
                vocabData.settings.words_per_round = val;
                Storage.saveVocab(vocabData);
            });
        }
    }

    // ── START NEW ROUND ───────────────────────────────────
    function startNewRound() {
        const count = vocabData.settings.words_per_round || 50;
        const round = gameEngine.startRound(count);
        if (!round || round.total === 0) {
            document.getElementById('cards-en').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;">🎉 Tất cả từ đã thuộc!</p>';
            document.getElementById('cards-vi').innerHTML = '';
            return;
        }
        renderGameBoard(round);
        updateScoreDisplay();
        document.getElementById('learned-list').innerHTML = '';
    }

    // ── REPLAY CURRENT ROUND ─────────────────────────────
    function replayCurrentRound() {
        const round = gameEngine.replayRound();
        if (!round || round.total === 0) {
            return; // Chưa có lượt nào để chơi lại
        }
        renderGameBoard(round);
        updateScoreDisplay();
        document.getElementById('learned-list').innerHTML = '';
    }

    // ── RENDER GAME BOARD ─────────────────────────────────
    function renderGameBoard(round) {
        const showDef = document.getElementById('toggle-definition').checked;
        const cardsEN = document.getElementById('cards-en');
        const cardsVI = document.getElementById('cards-vi');

        // Render English cards (Left now)
        cardsEN.innerHTML = round.enCards.map((card, i) => `
            <div class="card card-en" data-index="${i}" data-id="${card.id}">
                <div class="card-word">
                    <span>${card.word}</span>
                    <span class="card-ipa">${card.ipa}</span>
                    ${Speech.isSpeechSupported() ? `<button class="btn-speak" data-word="${card.word}" title="Phát âm">🔊</button>` : ''}
                </div>
                <div class="card-definition ${showDef ? '' : 'hidden'}">${card.definition}</div>
                <button class="btn-mastered" data-id="${card.id}" title="Đánh dấu đã thuộc">☑️</button>
            </div>
        `).join('');

        // Render Vietnamese cards (Right now)
        cardsVI.innerHTML = round.viCards.map((card, i) => `
            <div class="card card-vi" data-index="${i}" data-id="${card.id}">
                <div class="card-vi-text">${card.text}</div>
            </div>
        `).join('');

        // Event delegation for cards
        cardsEN.onclick = handleCardClick;
        cardsVI.onclick = handleCardClick;
    }

    // ── HANDLE CARD CLICK ─────────────────────────────────
    function handleCardClick(e) {
        // Handle speak button
        const speakBtn = e.target.closest('.btn-speak');
        if (speakBtn) {
            e.stopPropagation();
            Speech.pronounce(speakBtn.dataset.word);
            return;
        }

        // Handle mastered button
        const masteredBtn = e.target.closest('.btn-mastered');
        if (masteredBtn) {
            e.stopPropagation();
            const wordId = masteredBtn.dataset.id;
            const word = vocabData.vocabulary.find(w => w.id === wordId);
            showModal(`Đánh dấu "<strong>${word.word}</strong>" là đã thuộc?`, () => {
                gameEngine.markAsMastered(wordId);
                Storage.saveVocab(vocabData);
                // Remove both cards from the board
                removeCardPairFromBoard(wordId);
                updateStats();
            });
            return;
        }

        // Handle card selection
        const card = e.target.closest('.card');
        if (!card || card.classList.contains('matched')) return;

        const isEN = card.classList.contains('card-en');
        const index = parseInt(card.dataset.index);
        const side = isEN ? 'en' : 'vi';

        // Toggle selection on same side
        const sameCards = card.parentElement.querySelectorAll('.card');
        sameCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        const result = gameEngine.selectCard(side, index);
        if (result) {
            handleMatchResult(result);
        }
    }

    // ── HANDLE MATCH RESULT ───────────────────────────────
    function handleMatchResult(result) {
        const enCard = document.querySelector(`.card-en[data-index="${result.enIndex}"]`);
        const viCard = document.querySelector(`.card-vi[data-index="${result.viIndex}"]`);

        if (result.correct) {
            enCard.classList.remove('selected');
            viCard.classList.remove('selected');
            enCard.classList.add('correct');
            viCard.classList.add('correct');

            // Update spaced repetition — đoán đúng → lên móc
            Spaced.onCorrect(result.word);
            Storage.saveVocab(vocabData);

            // Add to learned list (show hook info)
            addToLearnedList(result.word);

            // Remove after animation
            setTimeout(() => {
                enCard.classList.add('matched');
                viCard.classList.add('matched');
                updateScoreDisplay();

                if (gameEngine.isRoundComplete()) {
                    showRoundComplete();
                }
            }, 700);
        } else {
            enCard.classList.add('wrong');
            viCard.classList.add('wrong');

            // Đoán SAI → ghi nhận lần sai cho từ tiếng Anh đang chọn
            const wrongWord = gameEngine.currentRound.pairs.find(w => w.id === result.word.id);
            if (wrongWord) {
                Spaced.onWrong(wrongWord);
                Storage.saveVocab(vocabData);
            }

            setTimeout(() => {
                enCard.classList.remove('wrong', 'selected');
                viCard.classList.remove('wrong', 'selected');
            }, 600);
        }
    }

    // ── REMOVE CARD PAIR (when marking mastered) ──────────
    function removeCardPairFromBoard(wordId) {
        const enCard = document.querySelector(`.card-en[data-id="${wordId}"]`);
        const viCard = document.querySelector(`.card-vi[data-id="${wordId}"]`);
        if (enCard) {
            enCard.classList.add('correct');
            setTimeout(() => enCard.classList.add('matched'), 700);
        }
        if (viCard) {
            viCard.classList.add('correct');
            setTimeout(() => viCard.classList.add('matched'), 700);
        }
        if (gameEngine.currentRound) {
            gameEngine.currentRound.matched.add(wordId);
            gameEngine.currentRound.score++;
            updateScoreDisplay();
        }
    }

    // ── ADD TO LEARNED LIST ───────────────────────────────
    function addToLearnedList(word) {
        const list = document.getElementById('learned-list');
        const item = document.createElement('div');
        item.className = 'learned-item';
        const hookLabel = Spaced.getHookLabel(word);
        item.innerHTML = `<strong>${word.word}</strong> ↔ ${word.meaning_vi} <span style="color:#94a3b8;font-size:0.8em;margin-left:8px">${hookLabel}</span>`;
        list.appendChild(item);
    }

    // ── ROUND COMPLETE ────────────────────────────────────
    function showRoundComplete() {
        const stats = gameEngine.getRoundStats();
        // Update streak
        const today = Spaced.toDateStr(new Date());
        if (vocabData.stats.last_study_date !== today) {
            if (vocabData.stats.last_study_date === getYesterday()) {
                vocabData.stats.current_streak++;
            } else {
                vocabData.stats.current_streak = 1;
            }
            vocabData.stats.last_study_date = today;
        }
        Storage.saveVocab(vocabData);

        showModal(
            `🎉 Hoàn thành lượt!<br>Đúng: ${stats.score}/${stats.total}<br>Độ chính xác: ${stats.accuracy}%`,
            () => startNewRound(),
            'Lượt tiếp'
        );
    }

    function getYesterday() {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return Spaced.toDateStr(d);
    }

    // ── SCORE DISPLAY ─────────────────────────────────────
    function updateScoreDisplay() {
        if (!gameEngine.currentRound) return;
        const r = gameEngine.currentRound;
        document.getElementById('score-display').textContent = `Score: ${r.score}/${r.total}`;
    }

    // ── REVIEW TAB ────────────────────────────────────────
    function renderReviewTab() {
        currentReviewWords = Spaced.getWordsForReview(vocabData.vocabulary);
        currentReviewIndex = 0;

        const container = document.getElementById('review-card-container');
        const empty = document.getElementById('review-empty');
        const info = document.getElementById('review-info');

        if (currentReviewWords.length === 0) {
            container.innerHTML = '';
            empty.style.display = 'block';
            info.textContent = '';
            return;
        }

        empty.style.display = 'none';
        info.textContent = `${currentReviewWords.length} từ cần ôn tập hôm nay`;
        showReviewCard();
    }

    function showReviewCard() {
        if (currentReviewIndex >= currentReviewWords.length) {
            document.getElementById('review-card-container').innerHTML = `
                <div class="review-card">
                    <div class="review-word">🎉</div>
                    <p>Đã ôn tập xong tất cả từ hôm nay!</p>
                    <p style="color:#94a3b8;margin-top:10px">${currentReviewWords.length} từ đã ôn</p>
                </div>
            `;
            return;
        }

        const word = currentReviewWords[currentReviewIndex];
        const container = document.getElementById('review-card-container');
        container.innerHTML = `
            <div class="review-card">
                <p style="color:#94a3b8;margin-bottom:10px">${currentReviewIndex + 1} / ${currentReviewWords.length}</p>
                <div class="review-word">${word.meaning_vi}</div>
                <p style="color:#94a3b8;margin:15px 0">Từ tiếng Anh là gì?</p>
                <div id="review-answer" style="display:none">
                    <div class="review-word" style="color:#3b82f6">${word.word}</div>
                    <p style="color:#94a3b8">${word.ipa}</p>
                    <p style="margin-top:8px">${word.definition}</p>
                    ${Speech.isSpeechSupported() ? `<button class="btn-speak" onclick="VocabApp.Speech.pronounce('${word.word}')" style="font-size:2em;margin-top:10px;background:none;border:none;cursor:pointer">🔊</button>` : ''}
                </div>
                <div id="review-show-btn" style="margin-top:20px">
                    <button class="btn btn-primary" onclick="VocabApp.App.revealAnswer()">👀 Hiện đáp án</button>
                </div>
                <div id="review-quality-btns" style="display:none" class="review-buttons">
                    <button class="btn btn-forgot" onclick="VocabApp.App.rateReview(0)">😢 Quên</button>
                    <button class="btn btn-hard" onclick="VocabApp.App.rateReview(1)">😐 Hơi quên</button>
                    <button class="btn btn-easy" onclick="VocabApp.App.rateReview(2)">😊 Nhớ</button>
                </div>
            </div>
        `;
    }

    function revealAnswer() {
        document.getElementById('review-answer').style.display = 'block';
        document.getElementById('review-show-btn').style.display = 'none';
        document.getElementById('review-quality-btns').style.display = 'flex';
    }

    function rateReview(quality) {
        const word = currentReviewWords[currentReviewIndex];
        Spaced.calculateNextReview(word, quality);
        Storage.saveVocab(vocabData);
        currentReviewIndex++;
        showReviewCard();
        updateStats();
    }

    // ── MASTERED TAB ──────────────────────────────────────
    function setupMasteredView() {
        document.getElementById('btn-export').addEventListener('click', () => Storage.exportJSON());
        
        document.getElementById('btn-import-file').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                vocabData = await Storage.importJSON(file);
                gameEngine = new Game.GameEngine(vocabData);
                renderMasteredTab();
                updateStats();
                alert('✅ Nhập dữ liệu thành công!');
            } catch (err) {
                alert('❌ Lỗi: ' + err.message);
            }
            e.target.value = '';
        });

        document.getElementById('search-mastered').addEventListener('input', (e) => {
            renderMasteredList(e.target.value.toLowerCase());
        });
    }

    function renderMasteredTab() {
        const mastered = gameEngine.getMasteredWords();
        document.getElementById('mastered-count').textContent = mastered.length;
        renderMasteredList('');
    }

    function renderMasteredList(filter) {
        const mastered = gameEngine.getMasteredWords();
        const filtered = filter 
            ? mastered.filter(w => w.word.toLowerCase().includes(filter) || w.meaning_vi.toLowerCase().includes(filter))
            : mastered;

        const list = document.getElementById('mastered-list');
        if (filtered.length === 0) {
            list.innerHTML = `<p style="text-align:center;color:#94a3b8;padding:30px">${mastered.length === 0 ? 'Chưa có từ nào đã thuộc.' : 'Không tìm thấy từ phù hợp.'}</p>`;
            return;
        }

        list.innerHTML = filtered.map(w => `
            <div class="mastered-item">
                <div>
                    <strong>${w.word}</strong>
                    <span style="color:#94a3b8;margin:0 8px">${w.ipa}</span>
                    <span>— ${w.meaning_vi}</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px">
                    <span style="color:#64748b;font-size:0.8em">${w.mastered_at ? new Date(w.mastered_at).toLocaleDateString('vi-VN') : ''}</span>
                    ${Speech.isSpeechSupported() ? `<button class="btn-speak" onclick="VocabApp.Speech.pronounce('${w.word}')">🔊</button>` : ''}
                    <button class="btn btn-secondary" style="font-size:0.8em;padding:6px 12px" onclick="VocabApp.App.unmarkMastered('${w.id}')">🔄 Học lại</button>
                </div>
            </div>
        `).join('');
    }

    function unmarkMastered(wordId) {
        showModal('Đưa từ này lại vào danh sách học?', () => {
            gameEngine.unmarkMastered(wordId);
            Storage.saveVocab(vocabData);
            renderMasteredTab();
            updateStats();
        });
    }

    // ── STATS TAB ─────────────────────────────────────────
    function updateStats() {
        if (!vocabData) return;
        const vocab = vocabData.vocabulary;
        const total = vocab.length;
        const mastered = vocab.filter(w => w.status === 'mastered').length;
        const learning = vocab.filter(w => w.status === 'learning').length;
        const newWords = vocab.filter(w => w.status === 'new').length;
        const due = Spaced.getDueCount(vocab);

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-new').textContent = newWords;
        document.getElementById('stat-learning').textContent = learning;
        document.getElementById('stat-mastered').textContent = mastered;
        document.getElementById('stat-streak').textContent = (vocabData.stats.current_streak || 0) + '🔥';
        document.getElementById('stat-due').textContent = due;

        const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
        document.getElementById('progress-fill').style.width = pct + '%';
        document.getElementById('progress-label').textContent = pct + '%';

        // Group breakdown
        const groups = {};
        vocab.forEach(w => {
            const g = w.group || 'Other';
            if (!groups[g]) groups[g] = { total: 0, mastered: 0, learning: 0 };
            groups[g].total++;
            if (w.status === 'mastered') groups[g].mastered++;
            if (w.status === 'learning') groups[g].learning++;
        });

        const groupDiv = document.getElementById('group-stats');
        groupDiv.innerHTML = Object.entries(groups).map(([name, g]) => {
            const gPct = g.total > 0 ? Math.round((g.mastered / g.total) * 100) : 0;
            return `
                <div class="group-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#1e293b;border-radius:8px;margin-bottom:8px">
                    <span>${name}</span>
                    <span style="color:#94a3b8">${g.mastered}/${g.total} thuộc (${gPct}%)</span>
                </div>
            `;
        }).join('');

        // Also update mastered count in the tab if visible
        const masteredCountEl = document.getElementById('mastered-count');
        if (masteredCountEl) masteredCountEl.textContent = mastered;
    }

    // ── MODAL ─────────────────────────────────────────────
    let modalResolve = null;

    function setupModal() {
        document.getElementById('modal-cancel').addEventListener('click', hideModal);
    }

    function showModal(message, onConfirm, confirmText = 'Xác nhận') {
        document.getElementById('modal-message').innerHTML = message;
        document.getElementById('modal-overlay').style.display = 'flex';
        const confirmBtn = document.getElementById('modal-confirm');
        confirmBtn.textContent = confirmText;
        confirmBtn.onclick = () => {
            hideModal();
            if (onConfirm) onConfirm();
        };
    }

    function hideModal() {
        document.getElementById('modal-overlay').style.display = 'none';
    }

    // ── PUBLIC API ────────────────────────────────────────
    return {
        init,
        revealAnswer,
        rateReview,
        unmarkMastered
    };
})();

// ── BOOTSTRAP ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    window.VocabApp.App.init();
});
