import { tgStreamClient } from "../telegram/client.js";
import { getSavedSession, saveSession, clearSession, getTgConfig, saveTgConfig } from "../telegram/session.js";

export class AuthModal {
  constructor(containerEl, onAuthSuccess) {
    this.container = containerEl;
    this.onAuthSuccess = onAuthSuccess;
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="modal-backdrop hidden" id="auth-modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <div class="modal-title">Telegram MTProto Connection</div>
            <button class="modal-close" id="modal-close-btn">&times;</button>
          </div>

          <div class="modal-body">
            <div class="status-box" id="auth-status-box">
              <span class="status-dot disconnected" id="modal-status-dot"></span>
              <span id="modal-status-text">Checking status...</span>
            </div>

            <!-- Tab Buttons -->
            <div class="auth-tabs">
              <button class="auth-tab-btn active" id="tab-session-btn">String Session</button>
              <button class="auth-tab-btn" id="tab-phone-btn">Phone Login (OTP)</button>
              <button class="auth-tab-btn" id="tab-api-btn">API Credentials</button>
            </div>

            <!-- Session String Form -->
            <div class="auth-panel" id="panel-session">
              <p class="auth-hint">Enter your Telegram string session:</p>
              <textarea class="auth-input" id="session-input" rows="4" placeholder="Paste your GramJS / Telethon StringSession here..."></textarea>
              <div class="auth-actions">
                <button class="btn-primary" id="btn-save-session">Connect with Session</button>
                <button class="btn-secondary" id="btn-clear-session">Clear</button>
              </div>
            </div>

            <!-- Phone Login Form -->
            <div class="auth-panel hidden" id="panel-phone">
              <div class="form-group" id="group-phone">
                <label>Phone Number (with international country code):</label>
                <input type="text" class="auth-input-single" id="phone-input" placeholder="+1234567890">
                <button class="btn-primary" id="btn-send-code">Send Telegram Code</button>
              </div>

              <div class="form-group hidden" id="group-otp">
                <label>Login Code (sent to your Telegram app):</label>
                <input type="text" class="auth-input-single" id="otp-input" placeholder="e.g. 54321">
                <button class="btn-primary" id="btn-verify-otp">Verify & Connect</button>
              </div>
            </div>

            <!-- Custom API Credentials Form -->
            <div class="auth-panel hidden" id="panel-api">
              <p class="auth-hint">Optionally specify your own Telegram API App Credentials (from my.telegram.org):</p>
              <div class="form-group">
                <label>API ID:</label>
                <input type="number" class="auth-input-single" id="api-id-input" placeholder="e.g. 12345678">
              </div>
              <div class="form-group">
                <label>API HASH:</label>
                <input type="text" class="auth-input-single" id="api-hash-input" placeholder="e.g. 0123456789abcdef0123456789abcdef">
              </div>
              <div class="auth-actions">
                <button class="btn-primary" id="btn-save-api">Save Credentials</button>
              </div>
            </div>

            <div class="auth-msg hidden" id="auth-msg"></div>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const backdrop = this.container.querySelector("#auth-modal-backdrop");
    const closeBtn = this.container.querySelector("#modal-close-btn");
    const tabSessionBtn = this.container.querySelector("#tab-session-btn");
    const tabPhoneBtn = this.container.querySelector("#tab-phone-btn");
    const tabApiBtn = this.container.querySelector("#tab-api-btn");
    const panelSession = this.container.querySelector("#panel-session");
    const panelPhone = this.container.querySelector("#panel-phone");
    const panelApi = this.container.querySelector("#panel-api");
    const sessionInput = this.container.querySelector("#session-input");
    const btnSaveSession = this.container.querySelector("#btn-save-session");
    const btnClearSession = this.container.querySelector("#btn-clear-session");

    const phoneInput = this.container.querySelector("#phone-input");
    const otpInput = this.container.querySelector("#otp-input");
    const btnSendCode = this.container.querySelector("#btn-send-code");
    const btnVerifyOtp = this.container.querySelector("#btn-verify-otp");
    const groupPhone = this.container.querySelector("#group-phone");
    const groupOtp = this.container.querySelector("#group-otp");

    const apiIdInput = this.container.querySelector("#api-id-input");
    const apiHashInput = this.container.querySelector("#api-hash-input");
    const btnSaveApi = this.container.querySelector("#btn-save-api");

    const config = getTgConfig();
    if (config.apiId) apiIdInput.value = config.apiId;
    if (config.apiHash) apiHashInput.value = config.apiHash;

    closeBtn.onclick = () => this.hide();
    backdrop.onclick = (e) => {
      if (e.target === backdrop) this.hide();
    };

    const activateTab = (activeBtn, activePanel) => {
      [tabSessionBtn, tabPhoneBtn, tabApiBtn].forEach((btn) => btn.classList.remove("active"));
      [panelSession, panelPhone, panelApi].forEach((p) => p.classList.add("hidden"));
      activeBtn.classList.add("active");
      activePanel.classList.remove("hidden");
    };

    tabSessionBtn.onclick = () => activateTab(tabSessionBtn, panelSession);
    tabPhoneBtn.onclick = () => activateTab(tabPhoneBtn, panelPhone);
    tabApiBtn.onclick = () => activateTab(tabApiBtn, panelApi);

    sessionInput.value = getSavedSession();

    btnSaveApi.onclick = () => {
      const id = parseInt(apiIdInput.value.trim(), 10);
      const hash = apiHashInput.value.trim();
      if (!id || !hash) {
        return this.showMessage("Please provide valid API ID and API Hash", "error");
      }
      saveTgConfig(id, hash);
      this.showMessage("Telegram API credentials saved!", "success");
    };

    btnSaveSession.onclick = async () => {
      const str = sessionInput.value.trim();
      if (!str) return this.showMessage("Please enter a valid session string", "error");
      saveSession(str);
      this.showMessage("Connecting to Telegram...", "info");
      btnSaveSession.disabled = true;

      try {
        const ok = await tgStreamClient.init();
        if (ok) {
          this.showMessage("Successfully connected to Telegram!", "success");
          setTimeout(() => this.hide(), 1200);
          if (this.onAuthSuccess) this.onAuthSuccess();
        } else {
          this.showMessage("Connection failed. Check your session string or credentials.", "error");
        }
      } catch (err) {
        this.showMessage(`Connection error: ${err.message || err}`, "error");
      } finally {
        btnSaveSession.disabled = false;
      }
    };

    btnClearSession.onclick = () => {
      clearSession();
      sessionInput.value = "";
      this.showMessage("Session cleared from browser storage.", "info");
    };

    // Phone Code Send
    btnSendCode.onclick = async () => {
      const phone = phoneInput.value.trim();
      if (!phone) return this.showMessage("Please enter your phone number with country code.", "error");

      const currConfig = getTgConfig();
      if (!currConfig.apiId || !currConfig.apiHash) {
        activateTab(tabApiBtn, panelApi);
        return this.showMessage("Please enter your API ID and API Hash first to login with Phone OTP.", "error");
      }

      btnSendCode.disabled = true;
      this.showMessage("Requesting login code from Telegram...", "info");

      try {
        await tgStreamClient.sendCode(phone);
        this.showMessage("Code sent! Check your Telegram app for the 5-digit code.", "success");
        groupPhone.classList.add("hidden");
        groupOtp.classList.remove("hidden");
        otpInput.focus();
      } catch (err) {
        this.showMessage(`Failed to send code: ${err.message || err}`, "error");
      } finally {
        btnSendCode.disabled = false;
      }
    };

    // OTP Verify
    btnVerifyOtp.onclick = async () => {
      const code = otpInput.value.trim();
      if (!code) return this.showMessage("Please enter the login code.", "error");

      btnVerifyOtp.disabled = true;
      this.showMessage("Authenticating with Telegram...", "info");

      try {
        const user = await tgStreamClient.signIn(code);
        this.showMessage(`Connected successfully as ${user.firstName || "Telegram User"}!`, "success");
        sessionInput.value = getSavedSession();
        setTimeout(() => this.hide(), 1200);
        if (this.onAuthSuccess) this.onAuthSuccess();
      } catch (err) {
        this.showMessage(`Login error: ${err.message || err}`, "error");
      } finally {
        btnVerifyOtp.disabled = false;
      }
    };

    // Status Listener
    tgStreamClient.onStatusChange((status) => {
      const dot = this.container.querySelector("#modal-status-dot");
      const text = this.container.querySelector("#modal-status-text");
      if (status.isConnected) {
        dot.className = "status-dot connected";
        text.textContent = `Connected as ${status.user?.firstName || "Telegram User"} (@${status.user?.username || "No Username"})`;
      } else if (status.isConnecting) {
        dot.className = "status-dot connecting";
        text.textContent = "Connecting to Telegram MTProto...";
      } else {
        dot.className = "status-dot disconnected";
        text.textContent = "Disconnected (Click below to connect)";
      }
    });
  }

  show() {
    this.container.querySelector("#auth-modal-backdrop").classList.remove("hidden");
  }

  hide() {
    this.container.querySelector("#auth-modal-backdrop").classList.add("hidden");
  }

  showMessage(msg, type = "info") {
    const el = this.container.querySelector("#auth-msg");
    el.textContent = msg;
    el.className = `auth-msg ${type}`;
    el.classList.remove("hidden");
  }
}
