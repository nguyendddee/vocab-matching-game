window.VocabApp = window.VocabApp || {};

window.VocabApp.Storage = (function() {
    const STORAGE_KEY = 'vocab_matching_data_v6';
    const API_URL = '/api/progress';
    let saveTimeout = null;
    let cloudSaveTimeout = null;
    let isOnVercel = false;

    // Detect if running on Vercel (has API available)
    async function checkAPI() {
        try {
            const res = await fetch(API_URL, { method: 'GET' });
            isOnVercel = res.ok;
        } catch {
            isOnVercel = false;
        }
    }

    function _buildProgressData(data) {
        return {
            settings: data.settings,
            stats: data.stats,
            progress: data.vocabulary
                .filter(w => w.status && w.status !== 'new')
                .map(w => ({
                    id: w.id,
                    status: w.status,
                    mastered_at: w.mastered_at,
                    last_reviewed: w.last_reviewed,
                    review_count: w.review_count,
                    next_review: w.next_review,
                    ease_factor: w.ease_factor,
                    interval_days: w.interval_days,
                    wrong_streak: w.wrong_streak || 0
                }))
        };
    }

    function _applyProgress(baseData, progressObj) {
        if (!progressObj) return;
        if (progressObj.settings) {
            baseData.settings = { ...baseData.settings, ...progressObj.settings };
        }
        if (progressObj.stats) {
            baseData.stats = progressObj.stats;
        }
        if (progressObj.progress) {
            const pMap = {};
            progressObj.progress.forEach(p => pMap[p.id] = p);
            baseData.vocabulary.forEach(w => {
                if (pMap[w.id]) {
                    Object.assign(w, pMap[w.id]);
                }
            });
        }
    }

    async function loadVocab() {
        // Check if API is available
        await checkAPI();

        let baseData = null;

        // Try to fetch vocab.json
        try {
            const response = await fetch('data/vocab.json');
            if (response.ok) {
                baseData = await response.json();
            }
        } catch (error) {
            // Fetch fails on file://
        }

        // Fallback to embedded window.VOCAB_DATA
        if (!baseData && window.VOCAB_DATA) {
            baseData = JSON.parse(JSON.stringify(window.VOCAB_DATA));
        }

        if (!baseData) {
            return { vocabulary: [], settings: { words_per_round: 50, show_definition: false, auto_pronounce: false }, stats: { total_learned: 0, total_mastered: 0, current_streak: 0, last_study_date: null } };
        }

        // Try to load progress from cloud (Vercel Blob) first
        let cloudProgress = null;
        if (isOnVercel) {
            try {
                const res = await fetch(API_URL);
                const json = await res.json();
                cloudProgress = json.progress;
            } catch (e) {
                console.warn('Không thể tải tiến trình từ cloud:', e);
            }
        }

        // Load local progress as fallback
        let localProgress = null;
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                localProgress = JSON.parse(stored);
            } catch (e) {
                console.error('Error parsing stored progress', e);
            }
        }

        // Use whichever has more progress entries (cloud wins on tie)
        const cloudCount = cloudProgress?.progress?.length || 0;
        const localCount = localProgress?.progress?.length || 0;
        const bestProgress = cloudCount >= localCount ? cloudProgress : localProgress;

        _applyProgress(baseData, bestProgress);
        saveVocab(baseData, true);
        return baseData;
    }

    function saveVocab(data, immediate = false) {
        const progressData = _buildProgressData(data);

        const doLocalSave = () => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(progressData));
            } catch (e) {
                console.warn('Lỗi lưu localStorage.', e);
            }
        };

        const doCloudSave = () => {
            if (!isOnVercel) return;
            fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(progressData)
            }).catch(e => console.warn('Lỗi lưu cloud:', e));
        };

        if (immediate) {
            doLocalSave();
            doCloudSave();
            return;
        }

        // Debounce local save (500ms)
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(doLocalSave, 500);

        // Debounce cloud save (2s) to reduce API calls
        if (cloudSaveTimeout) clearTimeout(cloudSaveTimeout);
        cloudSaveTimeout = setTimeout(doCloudSave, 2000);
    }

    function exportJSON() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return;

        const blob = new Blob([stored], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vocab_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data.vocabulary) throw new Error('Invalid data format');
                    saveVocab(data, true);
                    resolve(data);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Error reading file'));
            reader.readAsText(file);
        });
    }

    function resetAll() {
        localStorage.removeItem(STORAGE_KEY);
    }

    return {
        STORAGE_KEY,
        loadVocab,
        saveVocab,
        exportJSON,
        importJSON,
        resetAll
    };
})();
