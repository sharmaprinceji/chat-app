// ========== DOM refs ==========
const socket = io();

const loginOverlay = document.getElementById("loginOverlay");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const loginUserName = document.getElementById("loginUserName");
const signupName = document.getElementById("signupName");
const signupEmail = document.getElementById("signupEmail");
const signupUserName = document.getElementById("signupUserName");
const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const showLogin = document.getElementById("showLogin");
const showSignup = document.getElementById("showSignup");

const usernameSpan = document.getElementById("username");
const currentUserDiv = document.getElementById("current-user");
const logoutOption = document.getElementById("logout-option");
const leftList = document.getElementById("leftList");
const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const inputRow = document.querySelector(".input-row");
const chatHeader = document.querySelector(".chat-header");
const userCard = document.getElementById("usersCard");
// const modesBtns = document.querySelectorAll('input[name="mode"]');

const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");

// file attachment button (non-functional placeholder)
const fileBtn = document.getElementById("fileBtn");
const fileInput = document.getElementById("fileInput");
let selectedFile = null;

fileBtn.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) {
    selectedFile = fileInput.files[0];

    // show preview in chatBox footer or above input
    const previewId = "file-preview";
    let existing = document.getElementById(previewId);
    if (existing) existing.remove();

    const preview = document.createElement("div");
    preview.id = previewId;
    preview.style.margin = "6px 0";
    preview.style.fontSize = "13px";
    preview.style.color = "gray";
    preview.style.display = "flex";
    preview.style.alignItems = "center";
    preview.style.gap = "6px";

    // small thumbnail if image
    if (selectedFile.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(selectedFile);
      img.style.width = "40px";
      img.style.height = "40px";
      img.style.borderRadius = "6px";
      preview.appendChild(img);
    }

    const nameSpan = document.createElement("span");
    nameSpan.textContent = selectedFile.name;
    preview.appendChild(nameSpan);

    // cancel button
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "✖";
    cancelBtn.style.border = "none";
    cancelBtn.style.background = "transparent";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.onclick = () => {
      selectedFile = null;
      preview.remove();
      fileInput.value = ""; // reset input
    };
    preview.appendChild(cancelBtn);

    document.querySelector(".chat-area").appendChild(preview);
  }
});

// ========== state ==========
let token = localStorage.getItem("token") || null;
let me = { name: null, email: null, userName: null };
let mode = localStorage.getItem("mode") || "public";
let selectedPrivate = localStorage.getItem("selectedPrivate") || null;
let unreadCounts = {};
let allUsers = [];

// ========== UI toggles ==========
showLogin.onclick = () => {
  loginForm.style.display = "block";
  signupForm.style.display = "none";
};

showSignup.onclick = () => {
  loginForm.style.display = "none";
  signupForm.style.display = "block";
};

// ========== login/signup ==========
signupBtn.addEventListener("click", async () => {
  const n = signupName.value.trim(),
    e = signupEmail.value.trim(),
    u = signupUserName.value.trim();
  if (!n || !e || !u) return alert("Fill all fields");
  try {
    const res = await fetch("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: n,
        email: e,
        userName: u,
        exist: false,
      }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.message || "Signup failed");
    token = data.token;
    localStorage.setItem("token", token);
    me = data.user;
    localStorage.setItem("name", me.name);
    localStorage.setItem("email", me.email);
    localStorage.setItem("userName", me.userName);
    loginOverlay.style.display = "none";
    usernameSpan.textContent = me.name;
    socket.emit("identify", { userName: me.userName });
    await onModeChange();
    inputRow.style.display = "flex";
  } catch (err) {
    console.error(err);
    alert("Signup failed");
  }
});

loginBtn.addEventListener("click", async () => {
  const u = loginUserName.value.trim();
  if (!u) return alert("Enter username");
  try {
    const res = await fetch("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: u, exist: true }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.message || "Login failed");
    token = data.token;
    localStorage.setItem("token", token);
    me = data.user;
    localStorage.setItem("name", me.name);
    localStorage.setItem("email", me.email);
    localStorage.setItem("userName", me.userName);
    loginOverlay.style.display = "none";
    usernameSpan.textContent = me.name;
    socket.emit("identify", { userName: me.userName });
    await onModeChange();
    inputRow.style.display = "flex";
  } catch (err) {
    console.error(err);
    alert("Login failed");
  }
});

// autologin
window.addEventListener("DOMContentLoaded", async () => {
  const sname = localStorage.getItem("name");
  const semail = localStorage.getItem("email");
  const suser = localStorage.getItem("userName");
  const smode = localStorage.getItem("mode");
  const sselected = localStorage.getItem("selectedPrivate");
  if (sname && semail && suser) {
    me = { name: sname, email: semail, userName: suser };
    loginOverlay.style.display = "none";
    usernameSpan.textContent = me.name;
    if (smode) mode = smode;
    document
      .querySelectorAll('input[name="mode"]')
      .forEach((r) => (r.checked = r.value === mode));
    if (sselected) selectedPrivate = sselected;
    socket.emit("identify", { userName: me.userName });
    await onModeChange();
    inputRow.style.display = "flex";
    if (mode === "public") {
      chatHeader.style.display = "none";
      userCard.style.display = "none";
    } else {
      chatHeader.style.display = "flex";
      userCard.style.display = "block";
    }
  } else {
    if (smode) {
      mode = smode;
      document
        .querySelectorAll('input[name="mode"]')
        .forEach((r) => (r.checked = r.value === mode));
    }
  }
});

// ========== UI Profile logic code  ==========
document.addEventListener("DOMContentLoaded", () => {
  const profilePic = document.getElementById("profilePic");
  const profileDropdown = document.getElementById("profileDropdown");
  const profileUpload = document.getElementById("profileUpload");
  const usernameSpan = document.getElementById("username");

  let token = localStorage.getItem("token");
  logoutOption.style.display = "none";

  // ---------- Profile Modal ----------
  function openProfileModal(user) {
    const modal = document.createElement("div");
    modal.className = "profile-modal";
    modal.innerHTML = `
      <div class="profile-card">
        <span class="close-btn">&times;</span>
        <img src="${user.avatar || "default-avatar.png"}" 
             alt="profile" 
             id="modalProfilePic"
             class="profile-large" />
        <h2>${user.name}</h2>
        <p><b>Username:</b> ${user.username}</p>
        <p><b>Email:</b> ${user.email}</p>
        <p><b>Phone:</b> ${user.phone || "N/A"}</p>
        <p><b>Role:</b> ${user.role}</p>
      </div>
    `;
    document.body.appendChild(modal);

    // Close modal
    modal.querySelector(".close-btn").addEventListener("click", () => {
      modal.remove();
    });

    // Click profile picture in modal → trigger upload
    modal.querySelector("#modalProfilePic").addEventListener("click", () => {
      profileUpload.click();
    });
  }

  // ---------- Upload Profile Pic (logic unchanged) ----------
  profileUpload.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const username = localStorage.getItem("userName");
    if (!username) {
      alert("No username found in localStorage!");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/v1/uploadAvatar/${username}`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Profile update failed");

      // Update images in UI
      profilePic.src = data.avatarUrl;
      const modalPic = document.getElementById("modalProfilePic");
      if (modalPic) modalPic.src = data.avatarUrl;

      alert("Profile updated successfully!");
    } catch (err) {
      console.error("Profile update error:", err);
      alert("Failed to update profile");
    }
  });

  // ---------- Fetch user details on load ----------
  async function loadUserProfile() {
    if (!token) return;
    try {
      const res = await fetch("/api/v1/getUser", {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch user");

      usernameSpan.textContent = data.name.split(" ")[0];
      if (data.avatar) {
        profilePic.src = data.avatar;
      }

      //  Clicking username opens profile modal
      usernameSpan.addEventListener("click", () => openProfileModal(data));
    } catch (err) {
      console.error("Get user error:", err);
    }
  }

  loadUserProfile();
});

// logout
currentUserDiv.addEventListener("click", (e) => {
  e.stopPropagation();
  logoutOption.style.display =
    logoutOption.style.display === "block" ? "none" : "block";
});

logoutOption.addEventListener("click", () => {
  localStorage.clear();
  socket.disconnect();
  location.reload();
});

document.addEventListener("click", () => {
  logoutOption.style.display = "none";
});

// modes
document.querySelectorAll('input[name="mode"]').forEach((r) => {
  r.checked = r.value === mode;
  r.addEventListener("change", async (e) => {
    mode = e.target.value;
    localStorage.setItem("mode", mode);
    selectedPrivate = null;
    localStorage.removeItem("selectedPrivate");
    await onModeChange();
    if (mode === "public") {
      chatHeader.style.display = "none";
      userCard.style.display = "none";
    } else {
      chatHeader.style.display = "flex";
      userCard.style.display = "block";
    }
  });
});

// ========== Emoji picker logic (fixed) ==========
// Toggle picker visibility (stop propagation so outside click handler won't immediately hide)
emojiBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  emojiPicker.style.display =
    emojiPicker.style.display === "block" ? "none" : "block";
});

// robust handler to extract emoji string from event detail
function extractEmojiFromDetail(detail) {
  if (!detail) return "";
  // common: detail.unicode
  if (detail.unicode) return detail.unicode;
  // some builds: detail.emoji might be a string or an object
  if (typeof detail.emoji === "string") return detail.emoji;
  if (detail.emoji && typeof detail.emoji === "object") {
    // try several property names
    return (
      detail.emoji.unicode ||
      detail.emoji.character ||
      detail.emoji.native ||
      detail.emoji.shortcode ||
      ""
    );
  }
  // fallback: detail has 'shortcode' or 'native' or 'character'
  return detail.shortcode || detail.native || detail.character || "";
}

// handler to insert emoji into input
function onEmojiPicked(e) {
  try {
    e.stopPropagation();
    const emojiStr = extractEmojiFromDetail(e.detail);
    if (!emojiStr) return;
    // insert emoji at caret position if desired, for now append
    const start = messageInput.selectionStart || messageInput.value.length;
    const end = messageInput.selectionEnd || start;
    const before = messageInput.value.slice(0, start);
    const after = messageInput.value.slice(end);
    messageInput.value = before + emojiStr + after;
    // move caret after inserted emoji
    const caretPos = start + emojiStr.length;
    messageInput.focus();
    messageInput.setSelectionRange(caretPos, caretPos);
    // hide picker after selection
    emojiPicker.style.display = "none";
  } catch (err) {
    console.error("emoji handler err:", err);
  }
}

// attach both directly to the element and to document as fallback
try {
  if (emojiPicker) {
    emojiPicker.addEventListener("emoji-click", onEmojiPicked);
  }
  document.addEventListener("emoji-click", onEmojiPicked);
} catch (err) {
  console.warn("Failed to attach emoji listeners:", err);
}

// hide picker when clicking outside
document.addEventListener("click", (e) => {
  if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
    emojiPicker.style.display = "none";
  }
});

// ========== helpers & chat logic (kept intact) ==========
function clearChat() {
  chatBox.innerHTML = "";
}
function timeHM(d) {
  return new Date(d).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// REPLACE existing appendMessage with this (returns the element)
function appendMessage(m) {
  const el = document.createElement("div");
  el.className = "message " + (m.by === me.userName ? "me" : "other");

  // store server id if present
  if (m._id) el.dataset.msgId = m._id;
  else if (m.id) el.dataset.msgId = m.id;

  // store client-side temp id if present (used to patch local messages after server ack)
  if (m.clientTempId) el.dataset.tempId = m.clientTempId;

  // build inner HTML
  let inner = `<div><strong>${
    m.by === me.userName ? "You" : m.by
  }</strong></div>`;

  if (m.text) {
    // escape HTML minimally to avoid injection (simple)
    const escaped = String(m.text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    inner += `<div>${escaped}</div>`;
  }

  if (m.file) {
    if (m.file.mimetype && m.file.mimetype.startsWith("image/")) {
      inner += `<div><img src="${m.file.url}" style="max-width:180px;border-radius:6px;margin-top:6px"/></div>`;
    } else {
      inner += `<div><a href="${m.file.url}" target="_blank">${
        m.file.originalname || "file"
      }</a></div>`;
    }
  }

  inner += `<div class="meta">${timeHM(m.time)}</div>`;

  el.innerHTML = inner;

  // Who can delete? (message author or admin)
  const canDelete =
    (me && me.userName && m.by === me.userName) || (me && me.role === "admin");

  if (canDelete) {
    // create small delete button (hidden by default)
    const delBtn = document.createElement("button");
    delBtn.className = "delete-small";
    delBtn.title = "Delete message";
    delBtn.type = "button";
    delBtn.innerHTML = "🗑";

    // delete click handler
    delBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      // console.log("Current token before delete:", token);
      const id = el.dataset.msgId;
      if (!id) {
        return alert("Cannot delete: message id not available yet.");
      }
      if (!token) {
        return alert("Login required to delete messages");
      }

      // UI feedback
      delBtn.disabled = true;
      const prev = delBtn.innerHTML;
      delBtn.innerHTML = "…";

      try {
        // Determine whether this message is private.
        // Prefer explicit m.chatType if present (messages loaded from server),
        // otherwise fall back to current UI mode.
        const isPrivate =
          (m.chatType && m.chatType === "private") || mode === "private";

        const endpoint = isPrivate
          ? `/api/v1/messages/private/${id}`
          : `/api/v1/messages/${id}`;

        // call correct endpoint
        const res = await fetch(endpoint, {
          method: "DELETE",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
        });

        const data = await res.json();
        console.log("delete response", data);
        if (!res.ok) throw new Error(data.message || "Delete failed");

        // remove locally (server will broadcast too)
        el.remove();
      } catch (err) {
        console.error("delete error", err);
        alert("Delete failed: " + (err.message || "unknown"));
        delBtn.disabled = false;
        delBtn.innerHTML = prev;
      }
    });

    el.appendChild(delBtn);

    // dblclick toggles the delete button visibility
    el.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      // toggle show-delete class
      el.classList.toggle("show-delete");
      // optional: auto-hide after 4 seconds
      setTimeout(() => el.classList.remove("show-delete"), 5000);
    });
  }

  chatBox.appendChild(el);
  chatBox.scrollTop = chatBox.scrollHeight;
  return el;
}

async function fetchUsers() {
  try {
    const res = await fetch("/api/v1/users");
    const data = await res.json();
    allUsers = data;
    renderUserList(data);
  } catch (err) {
    console.error("fetch users error", err);
  }
}

// updated version of renderUserList with improved logic
function renderUserList(users) {
  leftList.innerHTML = "";

  // hide list in public mode
  if (mode === "public") {
    leftList.style.display = "none";
    return;
  } else {
    leftList.style.display = "block";
  }

  if (mode === "group") {
    ["QA Team", "Ops", "Managers"].forEach((g) => {
      const it = document.createElement("div");
      it.className = "user-item";
      it.textContent = g;
      it.onclick = () => {
        selectedPrivate = g; // simulate group selection
        localStorage.setItem("selectedPrivate", selectedPrivate);

        // in phone view, show chat and hide list
        if (window.innerWidth <= 600) {
          document.querySelector(".chat-area").classList.remove("hidden");
          document.querySelector(".left-panel").style.display = "none";
        }

        clearChat();
        const el = document.createElement("div");
        el.className = "coming-soon";
        el.textContent = "Group chat coming soon.";
        chatBox.appendChild(el);
      };
      leftList.appendChild(it);
    });
    return;
  }

  users.forEach((u) => {
    if (u.userName === me.userName) return;
    const it = document.createElement("div");
    it.className = "user-item";
    let badge = "";
    if (unreadCounts[u.userName] && unreadCounts[u.userName] > 0)
      badge = `<span class="badge">${unreadCounts[u.userName]}</span>`;
    it.innerHTML = `<div>${u.name}<div style="font-size:11px;color:gray">@${u.userName}</div></div>${badge}`;
    it.onclick = async () => {
      selectedPrivate = u.userName;
      localStorage.setItem("selectedPrivate", selectedPrivate);
      unreadCounts[u.userName] = 0;
      renderUserList(allUsers);
      await loadPrivate(selectedPrivate);

      // in phone view, show chat and hide list
      if (window.innerWidth <= 600) {
        document.querySelector(".chat-area").classList.remove("hidden");
        document.querySelector(".left-panel").style.display = "none";
      }
    };
    leftList.appendChild(it);
  });
}

async function loadPublic() {
  clearChat();
  try {
    const res = await fetch("/api/v1/messages/public");
    const data = await res.json();
    data.forEach((m) => appendMessage(m));
  } catch (err) {
    console.error(err);
  }
}

async function loadPrivate(other) {
  clearChat();
  try {
    const res = await fetch(`/api/v1/messages/private/${me.userName}/${other}`);
    const data = await res.json();
    if (!data.length) {
      const node = document.createElement("div");
      node.className = "coming-soon";
      node.textContent = "No messages yet — start the conversation.";
      chatBox.appendChild(node);
      return;
    }
    data.forEach((m) => appendMessage(m));
  } catch (err) {
    console.error(err);
  }
}

// updated version of onModeChange with improved logic
// When switching mode, adjust view for mobile
async function onModeChange() {
  clearChat();

  // reset phone responsive UI
  document.querySelector(".chat-area").classList.remove("hidden");
  document.querySelector(".left-panel").style.display = "block";

  if (mode === "public") {
    await fetchUsers();
    await loadPublic();
  } else if (mode === "private") {
    await fetchUsers();

    if (window.innerWidth <= 600 && !selectedPrivate) {
      // hide chat until user picks someone
      document.querySelector(".chat-area").classList.add("hidden");
    }

    if (selectedPrivate) await loadPrivate(selectedPrivate);
  } else if (mode === "group") {
    fetchUsers();

    if (window.innerWidth <= 600 && !selectedPrivate) {
      document.querySelector(".chat-area").classList.add("hidden");
    }

    const el = document.createElement("div");
    el.className = "coming-soon";
    el.textContent = "Group functionality coming soon.";
    chatBox.appendChild(el);
  }
}

// send message
sendBtn.addEventListener("click", async () => {
  const txt = messageInput.value.trim();

  // case: no text & no file → ignore
  if (!txt && !selectedFile) return;

  if (!me.userName) return alert("Login first");

  let fileData = null;

  // if file exists → upload to server first
  if (selectedFile) {
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch("/api/v1/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!data.success) throw new Error("Upload failed");

      fileData = data.file; // contains {url, public_id, originalname, mimetype}
    } catch (err) {
      console.error("File upload failed:", err);
      return alert("File upload failed");
    }
  }

  // prepare message data
  const msgData = {
    name: me.name,
    email: me.email,
    userName: me.userName,
    message: txt || null,
    file: fileData || null,
    time: new Date(),
    chatType: mode,
  };
  if (mode === "private") {
    if (!selectedPrivate) return alert("Select user for private chat");
    msgData.to = selectedPrivate;
  }

  // client-generated temp id to patch local element after server ack
  const clientTempId =
    "temp_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  msgData.clientTempId = clientTempId;

  // emit to server
  socket.emit("chat msg", msgData);

  // append message locally and tag it with temp id
  const el = appendMessage({
    text: msgData.message,
    file: msgData.file,
    by: me.userName,
    time: msgData.time,
    clientTempId: clientTempId,
  });

  if (el) el.dataset.tempId = clientTempId;

  // reset inputs
  messageInput.value = "";
  selectedFile = null;
  const preview = document.getElementById("file-preview");
  if (preview) preview.remove();
  fileInput.value = "";
});

socket.on("receive_msg", (data) => {
  if (!me.userName) return;

  const from = data.userName;
  const chatType = data.chatType;

  // helper to safely append msg
  function safeAppend(payload) {
    appendMessage({
      text: payload.message,
      file: payload.file || null,
      by: payload.userName || payload.by,
      time: payload.time,
      _id: payload._id || payload.id,
      clientTempId: payload.clientTempId,
    });
  }

  // PUBLIC / GROUP message
  if (chatType === "public" || chatType === "group") {
    // if this is an ack for our own message (server returned saved msg with clientTempId)
    if (from === me.userName && data.clientTempId) {
      const local = document.querySelector(
        `.message[data-temp-id="${data.clientTempId}"]`
      );
      if (local) {
        // set real server id so delete will work
        if (data._id) local.dataset.msgId = data._id;
        else if (data.id) local.dataset.msgId = data.id;

        // update time (if server normalized it)
        const meta = local.querySelector(".meta");
        if (meta) meta.textContent = timeHM(data.time);
        return; // done; don't duplicate
      }
    }

    // otherwise append for others
    if (from !== me.userName) {
      safeAppend(data);
    } else {
      // if from me but no clientTempId & no local match → append to keep consistent
      safeAppend(data);
    }
    return;
  }

  // PRIVATE message
  if (chatType === "private") {
    const fromUser = data.userName;
    const toUser = data.to;

    // if this is related to currently open private chat
    if (
      (fromUser === me.userName && toUser === selectedPrivate) ||
      (toUser === me.userName && fromUser === selectedPrivate)
    ) {
      // handle our own message ack via clientTempId
      if (fromUser === me.userName && data.clientTempId) {
        const local = document.querySelector(
          `.message[data-temp-id="${data.clientTempId}"]`
        );
        if (local) {
          if (data._id) local.dataset.msgId = data._id;
          else if (data.id) local.dataset.msgId = data.id;
          const meta = local.querySelector(".meta");
          if (meta) meta.textContent = timeHM(data.time);
          return;
        }
      }

      // append message for matched private chat
      safeAppend(data);
      return;
    }

    // incoming private message to me but not current open user → unread
    if (toUser === me.userName) {
      const fromWho = fromUser;
      unreadCounts[fromWho] = (unreadCounts[fromWho] || 0) + 1;
      renderUserList(allUsers);
    }
  }
});

// Show user list updates and toggle to back to user list on mobile
const backBtn = document.getElementById("backBtn");
const chatTitle = document.getElementById("chatTitle");

function openChat(userOrGroup) {
  selectedPrivate = userOrGroup;
  localStorage.setItem("selectedPrivate", selectedPrivate);

  // Hide list, show chat
  if (window.innerWidth <= 600) {
    document.querySelector(".chat-area").classList.remove("hidden");
    document.querySelector(".left-panel").style.display = "none";
  }

  chatTitle.textContent = userOrGroup; // show name at top
  clearChat();
  loadPrivate(userOrGroup); // or group
}

backBtn.addEventListener("click", () => {
  if (window.innerWidth <= 600) {
    document.querySelector(".chat-area").classList.add("hidden");
    document.querySelector(".left-panel").style.display = "block";
  }
});

// ========== image modal logic ==========
// Image modal preview
const imgModal = document.getElementById("imgModal");
const modalImg = document.getElementById("modalImg");
const closeModal = document.getElementById("closeModal");

// Event delegation: listen for clicks on chatBox images
chatBox.addEventListener("click", (e) => {
  if (e.target.tagName === "IMG" && e.target.closest(".message")) {
    modalImg.src = e.target.src;
    imgModal.style.display = "flex";
  }
});

// Close modal on X click
closeModal.addEventListener("click", () => {
  imgModal.style.display = "none";
});

// Close modal on background click
imgModal.addEventListener("click", (e) => {
  if (e.target === imgModal) {
    imgModal.style.display = "none";
  }
});

//---------delete chat history on double click of header ---------//
socket.on("messageDeleted", ({ id }) => {
  // support both .message and .msg selectors (compatibility)
  const msgDiv =
    document.querySelector(`.message[data-msg-id="${id}"]`) ||
    document.querySelector(`.msg[data-id="${id}"]`);

  if (msgDiv) {
    msgDiv.remove();
  }
});
