const BASE_URL = 'https://api.vsegpt.ru/v1';

const MODELS = {
    'anthropic/claude-3-5-haiku': { maxTokens: 8100, supportsImages: false },
    'openai/gpt-4o-mini': { maxTokens: 16000, supportsImages: true }
};

const DEFAULT_SETTINGS = {
    model: 'anthropic/claude-3-5-haiku',
    temperature: 0.7,
    maxTokens: 3000
};

const getApiKey = () => localStorage.getItem('api_key');

const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
};

const createNewChat = (chats) => {
    const chatId = Date.now().toString();
    return {
        ...chats,
        [chatId]: {
            id: chatId,
            title: `Чат ${Object.keys(chats).length + 1}`,
            messages: []
        }
    };
};

const deleteChat = (chats, chatId) => {
    const newChats = { ...chats };
    delete newChats[chatId];
    return newChats;
};

const addMessage = (chats, chatId, message) => ({
    ...chats,
    [chatId]: {
        ...chats[chatId],
        messages: [...chats[chatId].messages, message]
    }
});

const sendMessageToAPI = async (messages, settings) => {
    try {
        const response = await fetch(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getApiKey()}`,
            },
            body: JSON.stringify({
                model: settings.model,
                messages,
                temperature: settings.temperature,
                max_tokens: settings.maxTokens,
                extra_headers: { "X-Title": "Chat Interface" }
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
};

const saveChatsToStorage = (chats) => 
    localStorage.setItem('chats', JSON.stringify(chats));

const loadChatsFromStorage = () => 
    JSON.parse(localStorage.getItem('chats')) || {};

const renderMessages = (chatId, chats) => {
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '';

    if (!chatId || !chats[chatId]) return;

    chats[chatId].messages.forEach(message => {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.role}-message`;
        
        if (Array.isArray(message.content)) {
            message.content.forEach(content => {
                if (content.type === 'text') {
                    messageElement.innerHTML += marked.parse(content.text);
                } else if (content.type === 'image_url') {
                    const img = document.createElement('img');
                    img.src = content.image_url.url;
                    img.style.maxWidth = '200px';
                    img.style.maxHeight = '200px';
                    messageElement.appendChild(img);
                }
            });
        } else {
            messageElement.innerHTML = marked.parse(message.content);
        }
        
        messageElement.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
        
        messagesContainer.appendChild(messageElement);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

const renderChatsList = (chats, currentChatId, onChatSelect, onChatDelete) => {
    const chatsList = document.getElementById('chats-list');
    chatsList.innerHTML = '';
    
    Object.values(chats).forEach(chat => {
        const chatElement = document.createElement('div');
        chatElement.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        
        const titleSpan = document.createElement('span');
        titleSpan.textContent = chat.title;
        chatElement.appendChild(titleSpan);
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-chat-btn';
        deleteButton.innerHTML = '✕';
        deleteButton.onclick = (e) => {
            e.stopPropagation();
            onChatDelete(chat.id);
        };
        
        chatElement.onclick = () => onChatSelect(chat.id);
        chatElement.appendChild(deleteButton);
        chatsList.appendChild(chatElement);
    });
};

const renderSettings = (settings, onSettingsChange) => {
    const settingsContainer = document.querySelector('.settings-panel') || document.createElement('div');
    settingsContainer.className = 'settings-panel';
    settingsContainer.innerHTML = `
        <select id="model-select">
            ${Object.keys(MODELS).map(model => 
                `<option value="${model}" ${settings.model === model ? 'selected' : ''}>${model}</option>`
            ).join('')}
        </select>
        <div class="setting-item">
            <label>Температура: <span id="temp-value">${settings.temperature}</span></label>
            <input type="range" id="temperature" min="0" max="2" step="0.1" value="${settings.temperature}">
        </div>
        <div class="setting-item">
            <label>Макс. токенов: <span id="tokens-value">${settings.maxTokens}</span></label>
            <input type="range" id="max-tokens" min="100" max="${MODELS[settings.model].maxTokens}" step="100" value="${settings.maxTokens}">
        </div>
    `;
    
    document.querySelector('.sidebar').insertBefore(
        settingsContainer,
        document.getElementById('chats-list')
    );

    setupSettingsListeners(settings, onSettingsChange);
};

const initializeApp = () => {
    const checkApiKey = () => {
        const apiKey = getApiKey();
        if (!apiKey) {
            const modal = document.getElementById('api-key-modal');
            modal.style.display = 'block';
            
            document.getElementById('save-api-key').onclick = () => {
                const newApiKey = document.getElementById('api-key-input').value.trim();
                if (newApiKey) {
                    localStorage.setItem('api_key', newApiKey);
                    modal.style.display = 'none';
                    initializeChat();
                }
            };
        } else {
            initializeChat();
        }
    };

    const initializeChat = () => {
        let state = {
            chats: loadChatsFromStorage(),
            currentChatId: null,
            settings: { ...DEFAULT_SETTINGS }
        };

        const updateState = (newState) => {
            state = { ...state, ...newState };
            saveChatsToStorage(state.chats);
            renderChatsList(state.chats, state.currentChatId, selectChat, handleDeleteChat);
            renderMessages(state.currentChatId, state.chats);
        };

        const handleSendMessage = async () => {
            if (!state.currentChatId) {
                alert('Пожалуйста, создайте новый чат');
                return;
            }
            
            const input = document.getElementById('user-input');
            const message = input.value.trim();
            const imagePreview = document.getElementById('image-preview');
            const images = Array.from(imagePreview.querySelectorAll('img')).map(img => img.src);
            
            if (!message && images.length === 0) return;

            const content = [];
            if (message) {
                content.push({
                    type: "text",
                    text: message
                });
            }
            
            if (MODELS[state.settings.model].supportsImages) {
                images.forEach(image => {
                    content.push({
                        type: "image_url",
                        image_url: {
                            url: image
                        }
                    });
                });
            }

            const newChats = addMessage(state.chats, state.currentChatId, {
                role: 'user',
                content: content.length > 1 ? content : content[0].text
            });

            updateState({ chats: newChats });
            input.value = '';
            imagePreview.innerHTML = '';

            try {
                const response = await sendMessageToAPI(
                    newChats[state.currentChatId].messages,
                    state.settings
                );

                const chatsWithResponse = addMessage(newChats, state.currentChatId, {
                    role: 'assistant',
                    content: response.choices[0].message.content
                });

                updateState({ chats: chatsWithResponse });
            } catch (error) {
                console.error('Error:', error);
            }
        };

        const selectChat = (chatId) => {
            updateState({ currentChatId: chatId });
        };

        const handleDeleteChat = (chatId) => {
            const newChats = deleteChat(state.chats, chatId);
            const newCurrentChatId = state.currentChatId === chatId
                ? Object.keys(newChats)[0] || null
                : state.currentChatId;
            
            updateState({
                chats: newChats,
                currentChatId: newCurrentChatId
            });
        };

        const handleSettingsChange = (newSettings) => {
            updateState({ settings: newSettings });
        };

        document.getElementById('new-chat').addEventListener('click', () => {
            const newChats = createNewChat(state.chats);
            const newChatId = Object.keys(newChats).pop();
            updateState({
                chats: newChats,
                currentChatId: newChatId
            });
        });

        document.getElementById('send-message').addEventListener('click', handleSendMessage);
        document.getElementById('user-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });

        const initializeImageHandlers = () => {
            const imageInput = document.getElementById('image-input');
            const attachButton = document.getElementById('attach-image');
            const imagePreview = document.getElementById('image-preview');

            attachButton.addEventListener('click', () => {
                if (!MODELS[state.settings.model].supportsImages) {
                    alert('Текущая модель не поддерживает работу с изображениями');
                    return;
                }
                imageInput.click();
            });

            imageInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                
                for (const file of files) {
                    const base64 = await fileToBase64(file);
                    const previewItem = document.createElement('div');
                    previewItem.className = 'preview-item';
                    
                    const img = document.createElement('img');
                    img.src = base64;
                    
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'remove-image';
                    removeBtn.innerHTML = '×';
                    removeBtn.onclick = () => previewItem.remove();
                    
                    previewItem.appendChild(img);
                    previewItem.appendChild(removeBtn);
                    imagePreview.appendChild(previewItem);
                }
                
                imageInput.value = '';
            });
        };

        renderSettings(state.settings, handleSettingsChange);
        initializeImageHandlers();
        initializeVoiceInput();

        if (Object.keys(state.chats).length === 0) {
            const newChats = createNewChat(state.chats);
            const newChatId = Object.keys(newChats).pop();
            updateState({
                chats: newChats,
                currentChatId: newChatId
            });
        }
    };

    checkApiKey();
};

const initializeVoiceInput = () => {
    const voiceButton = document.getElementById('voice-input');
    let mediaRecorder;
    let audioChunks = [];

    voiceButton.addEventListener('click', async () => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            // Начинаем запись
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);

                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };

                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                    const formData = new FormData();
                    formData.append('file', audioBlob, 'speech.mp3');
                    formData.append('model', 'stt-openai/whisper-1');
                    formData.append('response_format', 'text');
                    formData.append('language', 'ru'); // опционально

                    try {
                        const response = await fetch(`${BASE_URL}/audio/transcriptions`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${getApiKey()}`
                            },
                            body: formData
                        });

                        const data = await response.text();
                        console.log('Ответ от API:', data);

                        document.getElementById('user-input').value += data;

                    } catch (error) {
                        console.error('Ошибка транскрибации:', error);
                    }

                    audioChunks = [];
                    voiceButton.classList.remove('recording');
                };

                mediaRecorder.start();
                voiceButton.classList.add('recording');

            } catch (error) {
                console.error('Ошибка доступа к микрофону:', error);
            }
        } else {
            // Останавливаем запись
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    });
};


const setupSettingsListeners = (settings, onSettingsChange) => {
    const modelSelect = document.getElementById('model-select');
    const temperatureInput = document.getElementById('temperature');
    const maxTokensInput = document.getElementById('max-tokens');

    modelSelect.addEventListener('change', (e) => {
        const newSettings = { 
            ...settings,
            model: e.target.value,
            maxTokens: Math.min(settings.maxTokens, MODELS[e.target.value].maxTokens)
        };
        maxTokensInput.max = MODELS[e.target.value].maxTokens;
        onSettingsChange(newSettings);
    });

    temperatureInput.addEventListener('input', (e) => {
        document.getElementById('temp-value').textContent = e.target.value;
        onSettingsChange({ ...settings, temperature: parseFloat(e.target.value) });
    });

    maxTokensInput.addEventListener('input', (e) => {
        document.getElementById('tokens-value').textContent = e.target.value;
        onSettingsChange({ ...settings, maxTokens: parseInt(e.target.value) });
    });
};

initializeApp();
