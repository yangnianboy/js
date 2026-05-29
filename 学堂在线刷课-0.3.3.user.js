// ==UserScript==
// @name         学堂在线刷课
// @namespace    http://tampermonkey.net/
// @version      0.3.3
// @description  该脚本可以完成学堂在线课程中的作业，视频以及图文
// @match        https://www.xuetangx.com/*
// @require      https://code.jquery.com/jquery-3.7.1.js
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// @license      GNU GPLv3
// ==/UserScript==

(function () {
            'use strict';
            const STORAGE_KEY = 'anwers';
            const CLICK_EVENT = 'mouseup';
            const CHOICE_MAP = {
                A: 0,
                B: 1,
                C: 2,
                D: 3,
                E: 4,
                F: 5,
                G: 6
            };

            // DOM添加
            const div = `
            <div id="main">
                <div class="a-header">
                    学堂在线助手
                </div>
                <div class="a-actions">
                    <button class="reading">刷课</button>
                    <button class="collect">收集</button>
                    <button class="random">找题</button>
                    <button class="answer">答题</button>
                    <button class="show">查看</button>
                    <button class="clear running">清空</button>
                </div>
                <div class="a-table">
                    <table>
                        <thead>
                            <tr>
                                <th>题目</th>
                                <th>答案</th>
                            </tr>
                        </thead>
                        <tbody>
                        </tbody>
                    </table>
                </div>
            </div>
            `
            document.querySelector("body").insertAdjacentHTML('beforeend', div)

            function addConfigBoxStyle () {
                // 添加样式
                let style = document.createElement('style')
                style.type = "text/css";

                let styleString = `
                #main,
                #main * {
                    box-sizing: border-box;
                    padding: 0;
                    margin: 0;
                }

                #main {
                    position: absolute;
                    right: 24px;
                    top: 120px;
                    width: 240px;
                    z-index: 999;
                    overflow: hidden;
                    border: 1px solid rgb(0 118 128 / 45%);
                    border-radius: 6px;
                    background-color: rgb(255 255 255 / 92%);
                    box-shadow: 0 4px 16px rgb(0 0 0 / 12%);
                }

                #main .a-header {
                    text-align: center;
                    height: 30px;
                    font-size: 13px;
                    line-height: 30px;
                    background-color: rgb(46, 157, 103);
                    color: #fff;
                    font-weight: 600;
                }

                #main .a-actions {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px;
                    padding: 8px;
                    background-color: rgb(245 248 248 / 95%);
                }

                #main .a-table tbody,
                #main .a-table tr {
                    display: block;
                    width: 240px;
                }

                #main .a-table tbody {
                    max-height: 160px;
                    overflow-y: auto;
                    -ms-overflow-style: none;
                }

                #main .a-table td,
                #main .a-table th {
                    text-align: center;
                    width: 120px;
                    padding: 4px 6px;
                    font-size: 12px;
                    line-height: 18px;
                    color: #222;
                    border-top: 1px solid rgb(0 0 0 / 8%);
                    word-break: break-all;
                }

                #main .a-table th {
                    color: #666;
                    background-color: rgb(250 250 250);
                }

                #main button {
                    height: 30px;
                    cursor: pointer;
                    border: 0;
                    border-radius: 4px;
                    color: #fff;
                    font-size: 13px;
                    text-align: center;
                }

                #main .reading,
                #main .collect,
                #main .random,
                #main .answer,
                #main .show {
                    background-color: rgb(153, 58, 58);
                }

                #main .disabled {
                    background-color: gray !important;
                    cursor: not-allowed !important;
                }

                #main .running {
                    background-color: rgb(46, 157, 103);
                }
                `
                let text = document.createTextNode(styleString)
                style.appendChild(text);
                document.getElementsByTagName('head')[0].appendChild(style);
            }
            addConfigBoxStyle()


            // 添加表格列表
            function rander (timu, anwers) {
                let tbody = document.querySelector('#main .a-table table tbody')
                if (!tbody) return
                let tr = document.createElement('tr')
                let timuTd = document.createElement('td')
                let anwersTd = document.createElement('td')
                timuTd.innerText = timu || ''
                anwersTd.innerText = Array.isArray(anwers) ? anwers.join(',') : anwers
                tr.appendChild(timuTd)
                tr.appendChild(anwersTd)
                tbody.appendChild(tr)
            }

            function clearTable () {
                let tbody = document.querySelector('#main .a-table table tbody')
                if (tbody) tbody.innerHTML = ''
            }

            function showCache () {
                let anwersLists = getCache()
                clearTable()
                if (anwersLists.length === 0) {
                    rander('暂无题库', '')
                    return
                }
                anwersLists.forEach(item => {
                    if (item) rander(item.timu, item.anwers)
                })
                console.table(anwersLists)
            }

            // 控制脚本页面样式
            function panelButton (className) {
                return $(`#main .${className}`)
            }

            const MODE_LABELS = {
                reading: '刷课',
                collect: '收集',
                random: '找题',
                answer: '答题'
            };
            const RUNNING_MODES = Object.keys(MODE_LABELS);
            let activeMode = null
            let timers = {}

            function updateModeButtons () {
                RUNNING_MODES.forEach(mode => {
                    let isRunning = activeMode === mode
                    panelButton(mode)
                        .text(isRunning ? '停止' : MODE_LABELS[mode])
                        .prop('disabled', activeMode && !isRunning)
                        .toggleClass('running', isRunning)
                        .toggleClass('disabled', activeMode && !isRunning)
                })
                panelButton('clear')
                    .prop('disabled', !!activeMode)
                    .toggleClass('disabled', !!activeMode)
                panelButton('show')
                    .prop('disabled', !!activeMode)
                    .toggleClass('disabled', !!activeMode)
            }

            function stopMode (mode) {
                clearInterval(timers[mode])
                timers[mode] = null
                if (activeMode === mode) {
                    activeMode = null
                }
                updateModeButtons()
            }

            function stopActiveMode () {
                if (activeMode) {
                    stopMode(activeMode)
                }
            }

            function toggleMode (mode, handler, interval) {
                if (activeMode === mode) {
                    stopMode(mode)
                    return
                }
                stopActiveMode()
                activeMode = mode
                updateModeButtons()
                handler()
                if (activeMode !== mode) return
                timers[mode] = setInterval(handler, interval)
            }

            function getCache () {
                try {
                    let cache = JSON.parse(localStorage.getItem(STORAGE_KEY))
                    return Array.isArray(cache) ? cache : []
                } catch (err) {
                    console.warn('题库缓存格式错误，已按空题库处理', err)
                    return []
                }
            }

            function setCache (anwersLists) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(anwersLists || []))
            }

            function getQuestionType () {
                let typeEven = document.querySelector('.question p')
                if (!typeEven) return ''
                let text = typeEven.innerText
                let right = text.indexOf('(')
                return right === -1 ? text.trim() : text.substring(1, right - 1)
            }

            function getQuestionCount (selector) {
                let even = document.querySelector(selector)
                if (!even) return ''
                let result = even.innerText.match(/\d+/)
                return result ? result[0] : even.innerText
            }

            function getQuestionIndex (selector) {
                return Number(getQuestionCount(selector)) || 0
            }

            function dispatchMouseup (even) {
                if (!even || even.disabled) return
                even.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
                even.dispatchEvent(new MouseEvent(CLICK_EVENT, { bubbles: true, cancelable: true, view: window }))
                even.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
            }

            function findElementByText (selectors, patterns) {
                let elements = Array.from(document.querySelectorAll(selectors))
                return elements.find(item => {
                    let text = (item.innerText || item.textContent || '').trim()
                    let title = (item.getAttribute('title') || '').trim()
                    let aria = (item.getAttribute('aria-label') || '').trim()
                    return patterns.some(pattern => pattern.test(text) || pattern.test(title) || pattern.test(aria))
                })
            }

            function getActionButton (fallback) {
                let btnCon = document.querySelector('.btnCon')
                let buttons = btnCon ? btnCon.querySelectorAll('button') : []
                return buttons[1] || fallback
            }

            function submitAndNext (next, delay) {
                let currentTimu = document.querySelector('.fuwenben')?.innerText
                setTimeout(function () {
                    dispatchMouseup(getActionButton(next))
                }, delay)
                setTimeout(function () {
                    let latestTimu = document.querySelector('.fuwenben')?.innerText
                    if (latestTimu === currentTimu) {
                        dispatchMouseup(getActionButton(next))
                    }
                }, delay + 1200)
            }

            function goNextSectionIfNeeded (total, curent) {
                if (total == curent) {
                    setTimeout(function () {
                        $('.next').click()
                    }, 1500)
                }
            }

            function goNextSection () {
                $('.next').click()
            }

            function goNextQuestionOrSection (next, total, curent) {
                if (total == curent) {
                    goNextSection()
                } else {
                    dispatchMouseup(next)
                }
            }

            // 创建对象
            function anw (type, timu, an) {
                this.type = type;
                this.timu = timu;
                this.anwers = an;
            }

            // 视频脚本
            function startVideo () {
                let video = $("video")[0];
                if (!video || !video.duration) return
                let staNow = $(".play-btn-tip");
                if (staNow.text() == "播放") {
                    $(".xt_video_player_mask").click();
                }
                let c = video.currentTime;
                let d = video.duration;
                //不想关闭声音可以把此行代码删掉
                soundClose();
                //视频播放进度超过95%跳转下一节视频
                if ((c / d) > 0.95) {
                    $(".next").click();
                    console.log("跳转到下一节");
                    console.log("本节观看百分比" + c / d);
                }
            }

            //关闭视频声音
            function soundClose () {
                let sound = $(".xt_video_player_common_icon_muted");
                if (sound.length == 0) {
                    $(".xt_video_player_common_icon").click();
                }
            }

            // 刷附件
            let word = function () {
                let next = document.querySelector('.btnCon button');
                if (!next) return
                dispatchMouseup(next);
                if ($(next).text().trim() == '我已看完') {
                    $('.next').click()
                }
            }

            // 刷题
            function automaticAnswers (tiku) {
                if (!Array.isArray(tiku) || tiku.length === 0) {
                    console.log('题库为空，请先收集答案');
                    return false
                }
                let timuEven = document.querySelector('.fuwenben')
                let btnCon = document.querySelector('.btnCon')
                if (!timuEven || !btnCon) return false
                let timu = timuEven.innerText;
                let next = btnCon.querySelectorAll('button')[1];
                let total = getQuestionCount('.total');
                let curent = getQuestionCount('.curent');
                let delay = 1000; // 延时1秒
                let anw = tiku.find(item => item.timu == timu)
                // 判断题型
                if (anw == undefined) {
                    console.log('题库未匹配到当前题目');
                    return false
                }
                if (anw.type == 1) {
                    // 选择题
                    let anwersEvenList = document.querySelector('.answerList')?.querySelectorAll('span') || []
                    anw.anwers.forEach(item => {
                        let num = CHOICE_MAP[item]
                        let anwersEven = anwersEvenList[num];
                        if (anwersEven) anwersEven.click()
                    });
                    rander(anw.timu, anw.anwers)
                } else if (anw.type == 2) {
                    // 判断题
                    let anwersEven = document.querySelector('.answerList')?.querySelectorAll('span')[anw.anwers];
                    if (anwersEven) anwersEven.click()
                    rander(anw.timu, anw.anwers)
                } else {
                    // 填空题
                    rander(anw.timu, anw.anwers)
                    $('.next').click()
                }



                submitAndNext(next, delay)
                goNextSectionIfNeeded(total, curent)
                return true
            }

            // 开始刷课
            function startClass () {
                // 判断页面类型
                let types = $('.t1').eq(0).text().trim();
                if (types == '视频') {
                    startVideo()
                } else if (types == '附件') {
                    word()
                } else if ($('.answerList').length != 0) {
                    goNextSection()
                }
                else {
                    console.log("未知错误！");
                }
            }

            // 自动答题
            let answerBusy = false

            function answerQuestions () {
                if (answerBusy) return
                if ($('.answerList').length == 0) {
                    goNextSection()
                    return
                }
                let tiku = getCache()
                if (automaticAnswers(tiku)) {
                    answerBusy = true
                    setTimeout(function () {
                        answerBusy = false
                    }, 2800)
                }
            }

            // 开始收集答案

            // 选择题
            function choiceQuestions (silent = false) {
                let anwers = [];
                let timu = document.querySelector('.fuwenben')?.innerText
                let answerList = document.querySelectorAll('.answerList')[1]
                let anwersEven = answerList ? answerList.querySelectorAll('span') : [];
                for (let j = 0; j < anwersEven.length; j++) {
                    anwers.push(anwersEven[j].innerText);
                }
                if (anwers.length === 0) {
                    if (!silent) alert('答案收集为空，请停止收集清空缓存后重新收集')
                    return
                }
                let ontime = new anw(1, timu, anwers);
                return ontime
            }

            // 判断题
            function judgmentQuestions (silent = false) {
                let anwers = null;
                let timu = document.querySelector('.fuwenben')?.innerText
                let answerList = document.querySelectorAll('.answerList')[1]
                let anwersEven = answerList ? answerList.querySelector('span') : null;
                if (!anwersEven) {
                    if (!silent) alert('答案收集为空，请停止收集清空缓存后重新收集')
                    return
                }
                if (anwersEven.className.indexOf('true') != -1) {
                    anwers = 0;
                } else {
                    anwers = 1;
                }
                let ontime = new anw(2, timu, anwers);
                return ontime
            }

            // 填空题
            function textQuestions (silent = false) {
                let anwersEven = document.querySelector('.answerList')?.querySelectorAll('.rightAnswer') || [];
                let anwers = [];
                let timu = document.querySelector('.fuwenben')?.innerText
                for (let i = 0; i < anwersEven.length; i++) {
                    anwers.push(anwersEven[i].innerHTML.substring(5));
                }
                if (anwers.length === 0) {
                    if (!silent) alert('答案收集为空，请停止收集清空缓存后重新收集')
                    return
                }
                let ontime = new anw(3, timu, anwers);
                return ontime
            }

            // 控制跳转下一题
            let Next = function () {
                let next = document.querySelector('.btnCon span>span')?.querySelector('button');
                dispatchMouseup(next);
            }

            let collectPrepareStep = 'goLast'

            function getAnswerCardButton () {
                return findElementByText('.btnCon button, .showAllAnswer', [/查看答题卡/, /答题卡/])
            }

            function getFirstQuestionInCard () {
                return findElementByText('.courseActionAnswerSheet.answerSheet .answerList .answer .con', [/^1$/])
            }

            function prepareCollectFromFirst () {
                let curent = getQuestionIndex('.curent')
                let total = getQuestionIndex('.total')
                if (collectPrepareStep === 'waitFirst') {
                    if (curent <= 1) {
                        collectPrepareStep = 'ready'
                        return true
                    }
                    return false
                }
                if (collectPrepareStep === 'goLast') {
                    if (total && curent < total) {
                        Next()
                        return false
                    }
                    collectPrepareStep = 'openCard'
                }
                if (collectPrepareStep === 'openCard') {
                    let cardButton = getAnswerCardButton()
                    if (!cardButton) {
                        console.log('未找到查看答题卡按钮')
                        return false
                    }
                    cardButton.click()
                    collectPrepareStep = 'chooseFirst'
                    return false
                }
                if (collectPrepareStep === 'chooseFirst') {
                    let firstQuestion = getFirstQuestionInCard()
                    if (!firstQuestion) {
                        console.log('未找到答题卡第1题')
                        return false
                    }
                    firstQuestion.click()
                    collectPrepareStep = total > 1 ? 'waitFirst' : 'ready'
                    return false
                }
                return collectPrepareStep === 'ready'
            }

            function collectCurrentQuestion (silent = false) {
                let anwersLists = getCache();
                let type = getQuestionType();
                let record = null;
                // 获取答案
                if (type == '单选题' || type == '多选题') {
                    record = choiceQuestions(silent);
                } else if (type == '判断题') {
                    record = judgmentQuestions(silent);
                } else if (type == '填空题') {
                    record = textQuestions(silent);
                } else {
                    console.log('错误信息');
                }
                if (record && !anwersLists.some(item => item && item.timu === record.timu)) {
                    anwersLists.push(record)
                    rander(record.timu, record.anwers)
                }
                setCache(anwersLists)
                return record
            }

            function collectAnwers () {
                // 学堂在线答案收集
                if ($('.answerList').length == 0) {
                    goNextSection()
                    return
                }
                if (!prepareCollectFromFirst()) return
                let total = getQuestionCount('.total');
                let curent = getQuestionCount('.curent');
                collectCurrentQuestion()
                goNextSectionIfNeeded(total, curent)
                Next(); // 跳转下一题
            }

            let randomBusy = false

            function randomSubmitAnswer () {
                if (randomBusy) return
                let btnCon = document.querySelector('.btnCon')
                if (!btnCon) return
                let next = btnCon.querySelectorAll('button')[1];
                let total = getQuestionCount('.total');
                let curent = getQuestionCount('.curent');
                let delay = 1000; // 延时1秒
                let type = getQuestionType();
                randomBusy = true
                if (type == '单选题' || type == '多选题' || type == '判断题') {
                    let anwersEven = document.querySelector('.answerList')?.querySelectorAll('span')[0];
                    if (anwersEven) anwersEven.click()
                } else {
                    document.querySelector('.next')?.click()
                    randomBusy = false
                    return
                }
                setTimeout(function () {
                    dispatchMouseup(getActionButton(next))
                }, delay)
                setTimeout(function () {
                    collectCurrentQuestion(true)
                }, delay + 1500)
                setTimeout(function () {
                    goNextQuestionOrSection(getActionButton(next), total, curent)
                    randomBusy = false
                }, delay + 2300)
            }

            // 跳过视频/附件，遇到测验后随机提交答案
            function findNextQuiz () {
                if ($('.answerList').length != 0) {
                    randomSubmitAnswer()
                    return
                }
                goNextSection()
            }
            // 添加点击事件
            panelButton('reading').click(function () {
                toggleMode('reading', startClass, 2000)
            })

            panelButton('collect').click(function () {
                console.log(localStorage.getItem(STORAGE_KEY))
                if (activeMode !== 'collect') collectPrepareStep = 'goLast'
                toggleMode('collect', collectAnwers, 2000)
            })

            panelButton('random').click(function () {
                toggleMode('random', findNextQuiz, 2000)
            })

            panelButton('answer').click(function () {
                toggleMode('answer', answerQuestions, 2000)
            })

            panelButton('show').click(function () {
                showCache()
            })

            panelButton('clear').click(function () {
                setCache([])
                clearTable()
                rander('题库已清空', '')
            })
        })();
