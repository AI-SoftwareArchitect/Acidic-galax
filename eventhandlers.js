document.addEventListener('DOMContentLoaded', function() {
  const messageForm = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');
  const chatMessages = document.getElementById('chatMessages');
  const newChatBtn = document.getElementById('newChatBtn');
  const chatHistory = document.getElementById('chatHistory');
  const searchInput = document.getElementById('searchInput');
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const closeBtn = document.getElementById('closeBtn');

  let currentChat = { id: Date.now(), messages: [], embeddings: [] };
  let savedChats = [];

  loadChatHistory();

  // Event Listeners
  newChatBtn.addEventListener('click', startNewChat);
  searchInput.addEventListener('input', filterChats);
  hamburgerBtn.addEventListener('click', toggleSidebar);
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  closeBtn.addEventListener('click', closeApp);

  messageForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const messageText = messageInput.value.trim();
    if (messageText) {
      sendMessage(messageText);
      messageInput.value = '';
    }
  });

  // Window Controls
  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      fullscreenBtn.innerHTML = '⛶';
      fullscreenBtn.title = 'Tam Ekran';
    } else {
      document.documentElement.requestFullscreen();
      fullscreenBtn.innerHTML = '⛷';
      fullscreenBtn.title = 'Tam Ekrandan Çık';
    }
  }

  function closeApp() {
    if (confirm('Uygulamayı kapatmak istediğinize emin misiniz?')) {
      window.close();
    }
  }

  // Sidebar Toggle
  function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
  }

  function cosineSimilarity(vecA, vecB) {
  const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dot / (normA * normB);
    }

    async function retrieveRelevantMessages(query, topK = 5) {
  const queryEmbedding = await getEmbedding(query);
  if (!queryEmbedding) return [];

  const scored = currentChat.embeddings.map(item => ({
    ...item,
    score: cosineSimilarity(queryEmbedding, item.embedding)
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}



  // Search Functionality
  function filterChats() {
    const searchTerm = searchInput.value.toLowerCase();
    const chatItems = document.querySelectorAll('.chat-item');
    chatItems.forEach(item => {
      const text = item.querySelector('.chat-item-text').textContent.toLowerCase();
      if (text.includes(searchTerm)) {
        item.classList.remove('hidden');
      } else {
        item.classList.add('hidden');
      }
    });
  }

  function startNewChat() {
    saveChat();
    currentChat = { id: Date.now(), messages: [], embeddings: [] };
    chatMessages.innerHTML = '<div class="logo-container"><img src="logo.png" class="logo"></div>';
    loadChatHistory();
  }

  function sendMessage(text) {
    addMessageToChat('user', text);
    setTimeout(async () => {
      const response = await generateResponse(text);
      addMessageToChat('bot', response);
    }, 1000);
  }

  async function getEmbedding(text) {
    try {
      const response = await fetch("http://localhost:11434/api/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "snowflake-arctic-embed2:latest",
          input: text      // prompt yerine input olabilir
        })
      });
      if (!response.ok) throw new Error("Embedding API hatası");
      const data = await response.json();
      return data.embedding;
    } catch (err) {
      console.error("Embedding alınamadı:", err);
      return null;
    }
  }

  // Tek noktadan render fonksiyonu
  function renderMessage(msg) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${msg.sender}-message`);

    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble');

    // Markdown-style code blockları yakala
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(msg.text)) !== null) {
      if (match.index > lastIndex) {
        const normalText = msg.text.slice(lastIndex, match.index);
        if (normalText.trim()) {
          const p = document.createElement('p');
          p.textContent = normalText.trim();
          bubble.appendChild(p);
        }
      }

      const lang = match[1] || "";
      const code = match[2];

      const pre = document.createElement('pre');
      const codeEl = document.createElement('code');
      codeEl.className = lang ? `language-${lang}` : "";
      codeEl.textContent = code.trim();
      pre.appendChild(codeEl);
      bubble.appendChild(pre);

      if (typeof hljs !== 'undefined') hljs.highlightElement(codeEl);

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < msg.text.length) {
      const remaining = msg.text.slice(lastIndex);
      if (remaining.trim()) {
        const p = document.createElement('p');
        p.textContent = remaining.trim();
        bubble.appendChild(p);
      }
    }

    messageElement.appendChild(bubble);
    return messageElement;
  }

  async function addMessageToChat(sender, text) {
    const msg = { sender, text, timestamp: new Date() };
    currentChat.messages.push(msg);

    const messageElement = renderMessage(msg);
    const logoContainer = document.querySelector('.logo-container');
    if (logoContainer) logoContainer.style.display = 'none';
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    const embedding = await getEmbedding(text);
    if (embedding) {
      currentChat.embeddings.push({ sender, text, embedding });
    }

    saveChat();
  }

    async function generateResponse(userMessage) {
    try {
        // En alakalı geçmiş mesajları getir
        const relevant = await retrieveRelevantMessages(userMessage, 5);

        const context = relevant
        .map(m => `${m.sender === "user" ? "User" : "Bot"}: ${m.text}`)
        .join("\n");

        const finalPrompt = 
        (context ? "Relevant history:\n" + context + "\n\n" : "") +
        "User: " + userMessage + "\nBot:";

        const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "qwen3:0.6b",
            prompt: finalPrompt
        })
        });

        if (!response.ok) throw new Error("Ollama API isteği başarısız: " + response.statusText);

        const data = await response.json();
        return data.response || "⚠️ Yanıt alınamadı.";
    } catch (err) {
        console.error("Ollama hata:", err);
        return "❌ Ollama ile bağlantı kurulamadı.";
    }
    }


  function saveChat() {
    if (currentChat.messages.length === 0) return;
    let savedChats = JSON.parse(localStorage.getItem('chatAppChats') || '[]');
    const idx = savedChats.findIndex(c => c.id === currentChat.id);
    if (idx >= 0) {
      savedChats[idx] = currentChat;
    } else {
      savedChats.push(currentChat);
    }
    localStorage.setItem('chatAppChats', JSON.stringify(savedChats));
    loadChatHistory();
  }

  function loadChatHistory() {
    savedChats = JSON.parse(localStorage.getItem('chatAppChats') || '[]');
    chatHistory.innerHTML = '';
    savedChats.forEach(chat => {
      const chatItem = document.createElement('div');
      chatItem.classList.add('chat-item');

      const chatText = document.createElement('div');
      chatText.classList.add('chat-item-text');
      const preview = chat.messages.length > 0 ?
        chat.messages[0].text.substring(0, 30) + (chat.messages[0].text.length > 30 ? '...' : '') :
        'Boş sohbet';
      chatText.textContent = new Date(chat.id).toLocaleDateString() + ' - ' + preview;

      const deleteBtn = document.createElement('button');
      deleteBtn.classList.add('delete-btn');
      deleteBtn.innerHTML = '🗑';
      deleteBtn.title = 'Sohbeti sil';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteChat(chat.id);
      });

      chatItem.appendChild(chatText);
      chatItem.appendChild(deleteBtn);

      chatItem.addEventListener('click', () => loadChat(chat));
      chatHistory.appendChild(chatItem);
    });
  }

  function deleteChat(chatId) {
    if (confirm('Bu sohbeti silmek istediğinize emin misiniz?')) {
      let savedChats = JSON.parse(localStorage.getItem('chatAppChats') || '[]');
      savedChats = savedChats.filter(chat => chat.id !== chatId);
      localStorage.setItem('chatAppChats', JSON.stringify(savedChats));

      if (currentChat.id === chatId) {
        currentChat = { id: Date.now(), messages: [], embeddings: [] };
        chatMessages.innerHTML = '<div class="logo-container"><img src="logo.png" class="logo"></div>';
      }
      loadChatHistory();
    }
  }

  function loadChat(chat) {
    saveChat();
    currentChat = chat;
    chatMessages.innerHTML = '';

    if (chat.messages.length === 0) {
      chatMessages.innerHTML = '<div class="logo-container"><img src="logo.png" class="logo"></div>';
    } else {
      chat.messages.forEach(msg => {
        const messageElement = renderMessage(msg);
        chatMessages.appendChild(messageElement);
      });
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  document.addEventListener('fullscreenchange', function() {
    if (document.fullscreenElement) {
      fullscreenBtn.innerHTML = '⛶';
      fullscreenBtn.title = 'Tam Ekrandan Çık';
    } else {
      fullscreenBtn.innerHTML = '⛶';
      fullscreenBtn.title = 'Tam Ekran';
    }
  });
});