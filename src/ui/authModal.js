import { tgStreamClient } from "../telegram/client.js";
import { getSavedSession, saveSession, clearSession, getTgConfig, saveTgConfig } from "../telegram/session.js";

export class AuthModal {
  constructor(containerEl, onAuthSuccess) {
    this.container = containerEl;
    this.onAuthSuccess = onAuthSuccess;
    this.currentTab = "phone"; // 'phone' | 'session'
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="login-page-container" id="login-page-backdrop">
        <div class="shadcn-card">
          
          <!-- Header -->
          <div class="shadcn-card-header">
            <div class="brand-badge-container">
              <div class="brand-icon">&#x25B6;</div>
            </div>
            <h1 class="shadcn-card-title">Welcome to Vaultgram</h1>
            <p class="shadcn-card-description">
              Sign in with your Telegram account to access your private decentralized cloud streams.
            </p>
          </div>

          <!-- Status Box -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0.85rem; background: hsl(var(--muted)); border: 1px solid hsl(var(--border)); border-radius: var(--radius);">
            <div class="status-indicator">
              <span class="status-dot disconnected" id="login-status-dot"></span>
              <span id="login-status-text" style="font-size: 0.8rem; font-weight: 500;">Disconnected</span>
            </div>
            <button class="shadcn-button ghost" id="btn-quick-clear" style="height: 24px; width: auto; padding: 0 6px; font-size: 0.725rem;">Reset</button>
          </div>

          <!-- shadcn Tab Selector -->
          <div class="shadcn-tabs-list">
            <button class="shadcn-tab-trigger active" id="tab-phone-trigger">
              <span>📱 Phone Number</span>
            </button>
            <button class="shadcn-tab-trigger" id="tab-session-trigger">
              <span>🔑 String Session</span>
            </button>
          </div>

          <!-- Form Panel 1: Phone + OTP Login -->
          <div class="shadcn-form" id="panel-phone">
            <div class="form-item" id="group-phone">
              <label class="form-label" for="phone-input">Phone Number</label>
              <input 
                type="tel" 
                class="shadcn-input" 
                id="phone-input" 
                placeholder="+1 234 567 8900" 
                autocomplete="tel"
              />
              <span class="form-hint">Enter your phone number with your international country code.</span>
              <button class="shadcn-button primary" id="btn-send-code" style="margin-top: 0.25rem;">
                Send Telegram Login Code
              </button>
            </div>

            <!-- OTP Verification Step -->
            <div class="form-item hidden" id="group-otp">
              <label class="form-label" for="otp-input">Telegram Login Code</label>
              <input 
                type="text" 
                class="shadcn-input" 
                id="otp-input" 
                placeholder="Enter the 5-digit code from your Telegram app" 
                maxlength="10"
              />
              <span class="form-hint">Check your Telegram mobile / desktop app for the login code.</span>
              <button class="shadcn-button primary" id="btn-verify-otp" style="margin-top: 0.25rem;">
                Verify & Sign In
              </button>
            </div>
          </div>

          <!-- Form Panel 2: String Session Login -->
          <div class="shadcn-form hidden" id="panel-session">
            <div class="form-item">
              <label class="form-label" for="session-input">GramJS / Telethon String Session</label>
              <textarea 
                class="shadcn-textarea" 
                id="session-input" 
                rows="3" 
                placeholder="1BVtsOHcBu7QM9x..."
              ></textarea>
              <span class="form-hint">Paste your existing MTProto session string for instant connection.</span>
              <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
                <button class="shadcn-button primary" id="btn-connect-session">
                  Connect Session
                </button>
              </div>
            </div>
          </div>

          <!-- Optional API Config Accordion -->
          <div class="api-credentials-accordion">
            <div class="accordion-header" id="accordion-toggle">
              <span>⚙️ Custom Telegram API App (Optional)</span>
              <span id="accordion-arrow">▾</span>
            </div>
            <div class="accordion-body hidden" id="accordion-content">
              <div class="form-item">
                <label class="form-label" style="font-size: 0.75rem;">API ID</label>
                <input type="number" class="shadcn-input" id="api-id-input" placeholder="e.g. 12345678" style="height: 2.1rem; font-size: 0.8rem;" />
              </div>
              <div class="form-item">
                <label class="form-label" style="font-size: 0.75rem;">API HASH</label>
                <input type="text" class="shadcn-input" id="api-hash-input" placeholder="e.g. 0123456789abcdef..." style="height: 2.1rem; font-size: 0.8rem;" />
              </div>
              <button class="shadcn-button secondary" id="btn-save-api-config" style="height: 2rem; font-size: 0.75rem;">
                Save Custom API Keys
              </button>
            </div>
          </div>

          <!-- Dynamic Alert / Toast -->
          <div class="shadcn-alert hidden" id="auth-alert"></div>

          <!-- Footer Privacy Notice -->
          <div class="card-footer-privacy">
            🔒 <strong>100% Client-Side</strong>: Your credentials and keys are stored solely in your browser's local storage and connect directly to official Telegram MTProto edge gateways over WSS.
          </div>

        </div>
      </div>
    `;
  }

  bindEvents() {
    const tabPhoneTrigger = this.container.querySelector("#tab-phone-trigger");
    const tabSessionTrigger = this.container.querySelector("#tab-session-trigger");
    const panelPhone = this.container.querySelector("#panel-phone");
    const panelSession = this.container.querySelector("#panel-session");

    const phoneInput = this.container.querySelector("#phone-input");
    const otpInput = this.container.querySelector("#otp-input");
    const btnSendCode = this.container.querySelector("#btn-send-code");
    const btnVerifyOtp = this.container.querySelector("#btn-verify-otp");
    const groupPhone = this.container.querySelector("#group-phone");
    const groupOtp = this.container.querySelector("#group-otp");

    const sessionInput = this.container.querySelector("#session-input");
    const btnConnectSession = this.container.querySelector("#btn-connect-session");
    const btnQuickClear = this.container.querySelector("#btn-quick-clear");

    const accordionToggle = this.container.querySelector("#accordion-toggle");
    const accordionContent = this.container.querySelector("#accordion-content");
    const accordionArrow = this.container.querySelector("#accordion-arrow");
    const apiIdInput = this.container.querySelector("#api-id-input");
    const apiHashInput = this.container.querySelector("#api-hash-input");
    const btnSaveApiConfig = this.container.querySelector("#btn-save-api-config");

    // Load saved API credentials if configured
    const savedConfig = getTgConfig();
    if (savedConfig.apiId) apiIdInput.value = savedConfig.apiId;
    if (savedConfig.apiHash) apiHashInput.value = savedConfig.apiHash;

    // Load saved session if exists
    sessionInput.value = getSavedSession();

    // Tab Switching
    tabPhoneTrigger.onclick = () => {
      tabPhoneTrigger.classList.add("active");
      tabSessionTrigger.classList.remove("active");
      panelPhone.classList.remove("hidden");
      panelSession.classList.add("hidden");
      this.currentTab = "phone";
    };

    tabSessionTrigger.onclick = () => {
      tabSessionTrigger.classList.add("active");
      tabPhoneTrigger.classList.remove("active");
      panelSession.classList.remove("hidden");
      panelPhone.classList.add("hidden");
      this.currentTab = "session";
    };

    // Accordion Toggle
    accordionToggle.onclick = () => {
      const isHidden = accordionContent.classList.toggle("hidden");
      accordionArrow.textContent = isHidden ? "▾" : "▴";
    };

    // Save Custom API Config
    btnSaveApiConfig.onclick = () => {
      const id = parseInt(apiIdInput.value.trim(), 10);
      const hash = apiHashInput.value.trim();
      if (!id || !hash) {
        return this.showAlert("Please enter both a valid API ID and API HASH", "error");
      }
      saveTgConfig(id, hash);
      this.showAlert("Custom Telegram API credentials saved successfully!", "success");
      accordionContent.classList.add("hidden");
      accordionArrow.textContent = "▾";
    };

    // 1. Phone Send Code
    btnSendCode.onclick = async () => {
      const phone = phoneInput.value.trim();
      if (!phone || phone.length < 6) {
        return this.showAlert("Please enter a valid phone number with country code (e.g. +1...)", "error");
      }

      const config = getTgConfig();
      if (!config.apiId || !config.apiHash) {
        accordionContent.classList.remove("hidden");
        accordionArrow.textContent = "▴";
        return this.showAlert("Please provide your Telegram API ID & Hash from my.telegram.org in the API settings below first.", "error");
      }

      btnSendCode.disabled = true;
      this.showAlert("Connecting to Telegram & requesting code...", "info");

      try {
        await tgStreamClient.sendCode(phone);
        this.showAlert("Code sent! Check your Telegram app for the verification code.", "success");
        groupPhone.classList.add("hidden");
        groupOtp.classList.remove("hidden");
        otpInput.focus();
      } catch (err) {
        this.showAlert(`Failed to send code: ${err.message || err}`, "error");
      } finally {
        btnSendCode.disabled = false;
      }
    };

    // 2. OTP Verification
    btnVerifyOtp.onclick = async () => {
      const code = otpInput.value.trim();
      if (!code) {
        return this.showAlert("Please enter the login code from Telegram", "error");
      }

      btnVerifyOtp.disabled = true;
      this.showAlert("Verifying code and authenticating...", "info");

      try {
        const user = await tgStreamClient.signIn(code);
        this.showAlert(`Connected as ${user.firstName || "User"} (@${user.username || "No Username"})! Loading Vaultgram...`, "success");
        setTimeout(() => {
          this.hide();
          if (this.onAuthSuccess) this.onAuthSuccess();
        }, 1000);
      } catch (err) {
        this.showAlert(`Authentication failed: ${err.message || err}`, "error");
      } finally {
        btnVerifyOtp.disabled = false;
      }
    };

    // 3. String Session Connect
    btnConnectSession.onclick = async () => {
      const str = sessionInput.value.trim();
      if (!str) {
        return this.showAlert("Please paste your String Session token", "error");
      }

      saveSession(str);
      btnConnectSession.disabled = true;
      this.showAlert("Connecting with string session...", "info");

      try {
        const ok = await tgStreamClient.init();
        if (ok) {
          this.showAlert("Authenticated successfully! Loading Vaultgram...", "success");
          setTimeout(() => {
            this.hide();
            if (this.onAuthSuccess) this.onAuthSuccess();
          }, 1000);
        } else {
          this.showAlert("Session connection failed. Please check the session string or login with Phone.", "error");
        }
      } catch (err) {
        this.showAlert(`Connection error: ${err.message || err}`, "error");
      } finally {
        btnConnectSession.disabled = false;
      }
    };

    // Reset button
    btnQuickClear.onclick = () => {
      clearSession();
      sessionInput.value = "";
      groupOtp.classList.add("hidden");
      groupPhone.classList.remove("hidden");
      this.showAlert("Local credentials cleared.", "info");
    };

    // Status updates
    tgStreamClient.onStatusChange((status) => {
      const dot = this.container.querySelector("#login-status-dot");
      const text = this.container.querySelector("#login-status-text");
      if (status.isConnected) {
        dot.className = "status-dot connected";
        text.textContent = `Signed In (@${status.user?.username || status.user?.firstName || "user"})`;
      } else if (status.isConnecting) {
        dot.className = "status-dot connecting";
        text.textContent = "Connecting to Telegram...";
      } else {
        dot.className = "status-dot disconnected";
        text.textContent = "Not signed in";
      }
    });
  }

  show() {
    const el = this.container.querySelector("#login-page-backdrop");
    if (el) el.classList.remove("hidden");
  }

  hide() {
    const el = this.container.querySelector("#login-page-backdrop");
    if (el) el.classList.add("hidden");
  }

  showAlert(msg, type = "info") {
    const alert = this.container.querySelector("#auth-alert");
    if (!alert) return;
    alert.textContent = msg;
    alert.className = `shadcn-alert ${type}`;
    alert.classList.remove("hidden");
  }
}
