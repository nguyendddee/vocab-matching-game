window.VocabApp = window.VocabApp || {};

window.VocabApp.Spaced = (function() {
    // 4 móc ngắt quãng cố định: 1, 3, 7, 15 ngày
    const HOOKS = [1, 3, 7, 15];

    function toDateStr(date) {
        return date.toISOString().split('T')[0];
    }

    // Lấy chỉ số móc hiện tại của từ (0-3, hoặc -1 nếu chưa học)
    function getHookIndex(wordObj) {
        const days = wordObj.interval_days || 0;
        for (let i = HOOKS.length - 1; i >= 0; i--) {
            if (days >= HOOKS[i]) return i;
        }
        return -1; // Chưa vào móc nào
    }

    // Đoán ĐÚNG → lên 1 móc tiếp theo
    function onCorrect(wordObj) {
        wordObj.review_count = (wordObj.review_count || 0) + 1;
        wordObj.last_reviewed = toDateStr(new Date());
        wordObj.wrong_streak = 0; // Reset chuỗi sai

        const hookIdx = getHookIndex(wordObj);
        const nextIdx = hookIdx + 1;

        if (nextIdx >= HOOKS.length) {
            // Đã vượt qua móc 15 ngày → ĐÃ THUỘC
            wordObj.status = 'mastered';
            wordObj.mastered_at = new Date().toISOString();
            wordObj.interval_days = HOOKS[HOOKS.length - 1];
            wordObj.next_review = null;
            return;
        }

        wordObj.interval_days = HOOKS[nextIdx];
        wordObj.status = 'learning';

        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + wordObj.interval_days);
        wordObj.next_review = toDateStr(nextDate);
    }

    // Đoán SAI → tăng bộ đếm sai; nếu sai đủ 2 lần liên tiếp → hạ 2 móc
    function onWrong(wordObj) {
        wordObj.wrong_streak = (wordObj.wrong_streak || 0) + 1;

        if (wordObj.wrong_streak >= 2) {
            wordObj.review_count = (wordObj.review_count || 0) + 1;
            wordObj.last_reviewed = toDateStr(new Date());
            wordObj.wrong_streak = 0; // Reset sau khi bị phạt

            const hookIdx = getHookIndex(wordObj);
            const newIdx = Math.max(0, hookIdx - 2); // Hạ 2 móc, tối thiểu móc 0

            wordObj.interval_days = HOOKS[newIdx];
            wordObj.status = 'learning';

            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + wordObj.interval_days);
            wordObj.next_review = toDateStr(nextDate);
        }
        // Nếu mới sai 1 lần → chưa phạt, chờ lần sau
    }

    // Dùng cho tab Ôn tập (giữ nguyên API cũ)
    function calculateNextReview(wordObj, quality) {
        if (quality >= 2) {
            onCorrect(wordObj);
        } else {
            // quality 0 hoặc 1 đều tính là sai
            wordObj.wrong_streak = 2; // Trong tab ôn tập, bấm "Quên" = phạt ngay
            onWrong(wordObj);
        }
    }

    function getWordsForReview(vocabList) {
        const todayStr = toDateStr(new Date());
        return vocabList.filter(word => {
            if (word.status !== 'learning') return false;
            if (!word.next_review) return true;
            return word.next_review <= todayStr;
        });
    }

    function getDueCount(vocabList) {
        return getWordsForReview(vocabList).length;
    }

    // Trả về tên móc hiện tại (để hiển thị UI)
    function getHookLabel(wordObj) {
        const idx = getHookIndex(wordObj);
        if (idx < 0) return 'Chưa học';
        if (wordObj.status === 'mastered') return '✅ Đã thuộc';
        return `Móc ${HOOKS[idx]} ngày`;
    }

    return {
        HOOKS,
        onCorrect,
        onWrong,
        calculateNextReview,
        getWordsForReview,
        getDueCount,
        getHookIndex,
        getHookLabel,
        toDateStr
    };
})();
