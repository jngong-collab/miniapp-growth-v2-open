const { callCloud } = require('../../utils/cloud-api')

function buildDisplayPrizes(prizes = []) {
    const fallback = Array.from({ length: 9 }).map((_, index) => ({
        id: index,
        name: index === 4 ? '' : '敬请期待',
        icon: index === 4 ? '' : '🎁',
        color: '#FFF8E1'
    }))

    const display = fallback.slice()
    prizes.slice(0, 8).forEach((item, index) => {
        const gridIndex = [0, 1, 2, 5, 8, 7, 6, 3][index]
        display[gridIndex] = {
            id: item.id || index,
            name: item.name,
            icon: item.icon || '🎁',
            color: item.color || '#FFF8E1',
            claimHint: item.claimHint || ''
        }
    })
    display[4] = { id: 'draw', name: '', icon: '', color: '' }
    return display
}

function resolveWinningIndex(displayPrizes, prize) {
    if (!Array.isArray(displayPrizes) || !prize) return 0
    const prizeId = prize.id ?? prize.prizeId ?? ''
    let matchIndex = prizeId ? displayPrizes.findIndex(item => item.id === prizeId) : -1
    if (matchIndex < 0 && prize.name) {
        matchIndex = displayPrizes.findIndex(item => item.name === prize.name)
    }
    return matchIndex >= 0 ? matchIndex : 0
}

Page({
    data: {
        campaign: null,
        prizes: buildDisplayPrizes(),
        rules: [],
        currentIndex: -1,
        isRunning: false,
        remainChances: 0,
        resultPrize: null,
        showResult: false,
        records: []
    },

    onLoad() {
        this.loadLotteryHome()
    },

    onShow() {
        this.loadLotteryHome()
    },

    async loadLotteryHome() {
        try {
            const data = await callCloud('growthApi', { action: 'getLotteryHome' })
            const campaign = data.campaign || null
            this.setData({
                campaign,
                prizes: buildDisplayPrizes(campaign ? campaign.prizes : []),
                rules: (campaign && campaign.rules) || [],
                remainChances: data.remainChances || 0,
                records: data.records || []
            })
        } catch (error) {
            wx.showToast({ title: error.message || '抽奖活动加载失败', icon: 'none' })
        }
    },

    _getSequence() {
        return [0, 1, 2, 5, 8, 7, 6, 3]
    },

    onGridCellTap(e) {
        if (!e.currentTarget.dataset.center) return
        this.startLottery()
    },

    async startLottery() {
        if (this.data.isRunning) return
        if (this.data.remainChances <= 0) {
            wx.showToast({ title: '今日次数已用完，明天再来~', icon: 'none' })
            return
        }

        this.setData({ isRunning: true, showResult: false, resultPrize: null })

        try {
            const data = await callCloud('growthApi', { action: 'drawLottery' })
            const prize = data.prize
            const seq = this._getSequence()
            const displayIndex = resolveWinningIndex(this.data.prizes, prize)
            const targetPos = displayIndex >= 0 ? seq.indexOf(displayIndex) : -1
            const safeTargetPos = targetPos >= 0 ? targetPos : 0
            const totalSteps = seq.length * 3 + safeTargetPos + Math.floor(Math.random() * 8)
            this._spin(0, totalSteps, seq, displayIndex, 50, prize, data.remainChances)
        } catch (error) {
            this.setData({ isRunning: false })
            wx.showToast({ title: error.message || '抽奖失败', icon: 'none' })
        }
    },

    _spin(step, totalSteps, seq, winIndex, speed, prize, remainChances) {
        if (step >= totalSteps) {
            this.setData({
                currentIndex: winIndex,
                isRunning: false,
                remainChances,
                resultPrize: prize,
                showResult: true
            })
            wx.vibrateShort({ type: 'heavy' }).catch(() => {})
            this.loadLotteryHome()
            return
        }

        this.setData({ currentIndex: seq[step % seq.length] })

        let next = speed
        const remaining = totalSteps - step
        if (remaining < 12) next = 100
        if (remaining < 8) next = 160
        if (remaining < 5) next = 260
        if (remaining < 3) next = 400

        setTimeout(() => this._spin(step + 1, totalSteps, seq, winIndex, next, prize, remainChances), next)
    },

    closeResult() {
        this.setData({ showResult: false })
    },

    onShareAppMessage() {
        return {
            title: (this.data.campaign && this.data.campaign.shareTitle) || '🎰 幸运大抽奖，免费推拿等你拿！',
            path: '/pages/lottery/lottery'
        }
    }
})
