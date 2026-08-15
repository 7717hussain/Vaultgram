import QRCode from "qrcode";
import { tgStreamClient } from "../telegram/client.js";
import { getSavedSession, setSavedSession, getTgConfig, saveTgConfig } from "../telegram/session.js";
import { vaultStore } from "../catalog/vaultStore.js";
import { createIcon, Icons } from "./icons.js";

/**
 * Modern 3-Tab MTProto Authentication & 3-Step Wizard:
 * - Tab 1: QR Code Login (Default & Recommended - canvas rendered via qrcode lib)
 * - Tab 2: Phone Number + OTP Code + Conditional 2FA Password State Machine
 * - Tab 3: Session String Import (with custom API Id/Hash override)
 * - Step 2: Channel Selection Wizard (Search, multi-select, Select All/Clear, No Public/Private distinction)
 */
export class AuthModal {
  constructor(containerEl, onComplete) {
    this.container = containerEl;
    this.onComplete = onComplete;
    this.step = 1; // 1: Login, 2: Channel Selection Wizard
    this.activeTab = "qr"; // 'qr' | 'phone' | 'session'
    
    // Phone State Machine
    this.phoneStep = "phone"; // 'phone' | 'otp' | '2fa'
    this.phoneNumber = "";
    this.phoneCodeHash = null;

    // QR State
    this.isGeneratingQr = false;
    this.qrPollActive = false;

    // Channel Wizard State
    this.discoveredChannels = [];
    this.selectedIds = new Set(vaultStore.selectedChannelIds);
    this.searchQuery = "";

    this.render();
    this.bindEvents();
  }

  show(step = 1) {
    this.step = step;
    const backdrop = this.container.querySelector("#auth-wizard-backdrop");
    if (backdrop) backdrop.classList.remove("hidden");
    this.renderStepView();
  }

  hide() {
    this.qrPollActive = false;
    const backdrop = this.container.querySelector("#auth-wizard-backdrop");
    if (backdrop) backdrop.classList.add("hidden");
  }

  render() {
    this.container.innerHTML = `
      <div class="login-page-container" id="auth-wizard-backdrop">
        <div class="shadcn-card" id="auth-card-body">
          <!-- Dynamically Rendered -->
        </div>
      </div>
    `;
    this.renderStepView();
  }

  renderStepView() {
    const card = this.container.querySelector("#auth-card-body");
    if (!card) return;

    while (card.firstChild) card.removeChild(card.firstChild);

    if (this.step === 1) {
      this.renderStep1AuthCard(card);
    } else if (this.step === 2) {
      this.renderStep2ChannelWizard(card);
    }
  }

  // =========================================================================
  // STEP 1: AUTHENTICATION CARD (3 TABS)
  // =========================================================================
  renderStep1AuthCard(card) {
    // Header
    const header = document.createElement("div");
    header.className = "shadcn-card-header";

    const badge = document.createElement("div");
    badge.className = "brand-badge-container";
    badge.appendChild(createIcon(Icons.HardDrive, { size: 22 }));
    header.appendChild(badge);

    const title = document.createElement("h1");
    title.className = "shadcn-card-title";
    title.textContent = "Welcome to Vaultgram";
    header.appendChild(title);

    const desc = document.createElement("p");
    desc.className = "shadcn-card-description";
    desc.textContent = "Connect to Telegram MTProto over WebSockets. Decentralized client-side drive.";
    header.appendChild(desc);
    card.appendChild(header);

    // 3 Tabs: QR Code (Default) | Phone OTP | Session String
    const tabsList = document.createElement("div");
    tabsList.className = "shadcn-tabs-list";

    // Tab 1: QR Code
    const tabQr = document.createElement("button");
    tabQr.className = `shadcn-tab-trigger ${this.activeTab === "qr" ? "active" : ""}`;
    tabQr.appendChild(createIcon(Icons.QrCode, { size: 14 }));
    const qrSpan = document.createElement("span");
    qrSpan.textContent = "QR Code";
    tabQr.appendChild(qrSpan);
    tabQr.onclick = () => {
      if (this.activeTab !== "qr") {
        this.activeTab = "qr";
        this.renderStepView();
      }
    };

    // Tab 2: Phone
    const tabPhone = document.createElement("button");
    tabPhone.className = `shadcn-tab-trigger ${this.activeTab === "phone" ? "active" : ""}`;
    tabPhone.appendChild(createIcon(Icons.Phone, { size: 14 }));
    const phoneSpan = document.createElement("span");
    phoneSpan.textContent = "Phone OTP";
    tabPhone.appendChild(phoneSpan);
    tabPhone.onclick = () => {
      if (this.activeTab !== "phone") {
        this.qrPollActive = false;
        this.isGeneratingQr = false;
        this.activeTab = "phone";
        this.renderStepView();
      }
    };

    // Tab 3: Session String
    const tabSession = document.createElement("button");
    tabSession.className = `shadcn-tab-trigger ${this.activeTab === "session" ? "active" : ""}`;
    tabSession.appendChild(createIcon(Icons.KeyRound, { size: 14 }));
    const sessSpan = document.createElement("span");
    sessSpan.textContent = "Session String";
    tabSession.appendChild(sessSpan);
    tabSession.onclick = () => {
      if (this.activeTab !== "session") {
        this.qrPollActive = false;
        this.isGeneratingQr = false;
        this.activeTab = "session";
        this.renderStepView();
      }
    };

    tabsList.appendChild(tabQr);
    tabsList.appendChild(tabPhone);
    tabsList.appendChild(tabSession);
    card.appendChild(tabsList);

    // Alert Banner
    const alertDiv = document.createElement("div");
    alertDiv.id = "auth-step1-alert";
    alertDiv.className = "shadcn-alert hidden";
    card.appendChild(alertDiv);

    // Render Active Tab Content
    if (this.activeTab === "qr") {
      this.renderQrLoginTab(card);
    } else if (this.activeTab === "phone") {
      this.renderPhoneLoginTab(card);
    } else {
      this.renderSessionImportTab(card);
    }
  }

  // --- TAB 1: QR CODE LOGIN ---
  renderQrLoginTab(card) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:14px;padding:8px 0;";

    // Canvas container with skeleton/spinner
    const qrFrame = document.createElement("div");
    qrFrame.style.cssText = "width:220px;height:220px;background:hsl(var(--muted)/0.5);border:1px solid hsl(var(--border));border-radius:var(--radius);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;";
    
    const canvas = document.createElement("canvas");
    canvas.id = "auth-qr-canvas";
    canvas.width = 200;
    canvas.height = 200;
    canvas.style.display = "none";
    qrFrame.appendChild(canvas);

    const spinnerBox = document.createElement("div");
    spinnerBox.id = "qr-loading-spinner";
    spinnerBox.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:8px;color:hsl(var(--muted-foreground));font-size:0.775rem;";
    const spinner = document.createElement("span");
    spinner.className = "download-spinner";
    spinner.style.cssText = "width:20px;height:20px;border-width:3px;";
    spinnerBox.appendChild(spinner);
    const spTxt = document.createElement("span");
    spTxt.textContent = "Connecting to Telegram MTProto...";
    spinnerBox.appendChild(spTxt);
    qrFrame.appendChild(spinnerBox);

    wrap.appendChild(qrFrame);

    // Scan Instructions
    const inst = document.createElement("div");
    inst.style.cssText = "text-align:center;display:flex;flex-direction:column;gap:4px;";
    
    const stepTxt = document.createElement("p");
    stepTxt.style.cssText = "font-size:0.8125rem;font-weight:500;color:hsl(var(--foreground));";
    stepTxt.textContent = "Scan from Telegram App";
    inst.appendChild(stepTxt);

    const pathTxt = document.createElement("p");
    pathTxt.style.cssText = "font-size:0.725rem;color:hsl(var(--muted-foreground));";
    pathTxt.textContent = "Telegram > Settings > Devices > Link Desktop Device";
    inst.appendChild(pathTxt);

    wrap.appendChild(inst);

    // Refresh QR button
    const btnRefreshQr = document.createElement("button");
    btnRefreshQr.className = "shadcn-button ghost";
    btnRefreshQr.style.cssText = "height:30px;font-size:0.75rem;";
    btnRefreshQr.appendChild(createIcon(Icons.RefreshCw, { size: 12 }));
    const refTxt = document.createElement("span");
    refTxt.textContent = "Reload QR Code";
    btnRefreshQr.appendChild(refTxt);
    btnRefreshQr.onclick = () => this.initiateQrLogin(canvas, spinnerBox);
    wrap.appendChild(btnRefreshQr);

    card.appendChild(wrap);

    // Auto-trigger QR generation
    setTimeout(() => {
      this.initiateQrLogin(canvas, spinnerBox);
    }, 100);
  }

  async initiateQrLogin(canvasEl, spinnerEl) {
    if (this.isGeneratingQr) return;
    this.isGeneratingQr = true;
    this.qrPollActive = true;

    canvasEl.style.display = "none";
    spinnerEl.style.display = "flex";

    try {
      await tgStreamClient.startQrLogin(
        (tgUrl) => {
          if (!this.qrPollActive) return;
          QRCode.toCanvas(canvasEl, tgUrl, { width: 200, margin: 1 }, (err) => {
            if (!err) {
              spinnerEl.style.display = "none";
              canvasEl.style.display = "block";
            }
          });
        },
        async (hint) => {
          const pass = prompt(`Your Telegram account requires 2FA Password ${hint ? `(${hint})` : ""}:`);
          return pass || "";
        }
      );

      // Successfully authorized via QR Code!
      this.isGeneratingQr = false;
      this.goToStep2();
    } catch (err) {
      console.error("QR Auth Error:", err);
      this.isGeneratingQr = false;
      if (this.qrPollActive) {
        this.showAlert(err.message || "QR Code expired or failed to connect.", "error");
      }
    }
  }

  // --- TAB 2: PHONE NUMBER + OTP + 2FA STATE MACHINE ---
  renderPhoneLoginTab(card) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:14px;padding:4px 0;";

    if (this.phoneStep === "phone") {
      // Step 2.1: Phone Input
      const item = document.createElement("div");
      item.className = "shadcn-form-item";
      
      const label = document.createElement("label");
      label.className = "shadcn-label";
      label.textContent = "Phone Number (International Format)";
      item.appendChild(label);

      const input = document.createElement("input");
      input.className = "shadcn-input";
      input.id = "phone-num-input";
      input.placeholder = "+1 234 567 8900";
      input.value = this.phoneNumber || "";
      item.appendChild(input);
      wrap.appendChild(item);

      const btnSend = document.createElement("button");
      btnSend.className = "shadcn-button";
      btnSend.id = "btn-phone-send";
      btnSend.textContent = "Send Verification Code";
      btnSend.onclick = async () => {
        const phone = input.value.trim();
        if (!phone || !phone.startsWith("+")) {
          this.showAlert("Please enter a valid phone number with '+' and country code (e.g. +123456789).", "error");
          return;
        }
        btnSend.disabled = true;
        btnSend.textContent = "Sending Code...";
        try {
          const res = await tgStreamClient.sendCode(phone);
          this.phoneNumber = phone;
          this.phoneCodeHash = res.phoneCodeHash;
          this.phoneStep = "otp";
          this.renderStepView();
        } catch (err) {
          this.showAlert(this.formatErrorMessage(err), "error");
          btnSend.disabled = false;
          btnSend.textContent = "Send Verification Code";
        }
      };
      wrap.appendChild(btnSend);

    } else if (this.phoneStep === "otp") {
      // Step 2.2: OTP Code Verification
      const item = document.createElement("div");
      item.className = "shadcn-form-item";

      const label = document.createElement("label");
      label.className = "shadcn-label";
      label.textContent = `Enter Code Sent to ${this.phoneNumber}`;
      item.appendChild(label);

      const input = document.createElement("input");
      input.className = "shadcn-input";
      input.id = "otp-code-input";
      input.placeholder = "12345";
      input.maxLength = 6;
      item.appendChild(input);
      wrap.appendChild(item);

      const btnVerify = document.createElement("button");
      btnVerify.className = "shadcn-button";
      btnVerify.textContent = "Verify & Sign In";
      btnVerify.onclick = async () => {
        const code = input.value.trim();
        if (!code) {
          this.showAlert("Please enter the 5-digit verification code.", "error");
          return;
        }
        btnVerify.disabled = true;
        btnVerify.textContent = "Verifying...";
        try {
          await tgStreamClient.signIn(code);
          this.goToStep2();
        } catch (err) {
          if (err.message && err.message.includes("SESSION_PASSWORD_NEEDED")) {
            this.phoneStep = "2fa";
            this.renderStepView();
            return;
          }
          this.showAlert(this.formatErrorMessage(err), "error");
          btnVerify.disabled = false;
          btnVerify.textContent = "Verify & Sign In";
        }
      };
      wrap.appendChild(btnVerify);

      // Back / Change Number
      const btnBack = document.createElement("button");
      btnBack.className = "shadcn-button ghost";
      btnBack.textContent = "Change Phone Number / Resend";
      btnBack.style.cssText = "height:28px;font-size:0.75rem;";
      btnBack.onclick = () => {
        this.phoneStep = "phone";
        this.renderStepView();
      };
      wrap.appendChild(btnBack);

    } else if (this.phoneStep === "2fa") {
      // Step 2.3: 2FA Password Input
      const item = document.createElement("div");
      item.className = "shadcn-form-item";

      const label = document.createElement("label");
      label.className = "shadcn-label";
      label.textContent = "2-Step Verification Password";
      item.appendChild(label);

      const input = document.createElement("input");
      input.className = "shadcn-input";
      input.type = "password";
      input.placeholder = "Enter your Cloud Password";
      item.appendChild(input);
      wrap.appendChild(item);

      const btn2FA = document.createElement("button");
      btn2FA.className = "shadcn-button";
      btn2FA.textContent = "Confirm Password & Connect";
      btn2FA.onclick = async () => {
        const pass = input.value;
        if (!pass) {
          this.showAlert("Please enter your 2FA password.", "error");
          return;
        }
        btn2FA.disabled = true;
        btn2FA.textContent = "Authenticating...";
        try {
          await tgStreamClient.signInWithPassword(pass);
          this.goToStep2();
        } catch (err) {
          this.showAlert(this.formatErrorMessage(err), "error");
          btn2FA.disabled = false;
          btn2FA.textContent = "Confirm Password & Connect";
        }
      };
      wrap.appendChild(btn2FA);

      const btnBack = document.createElement("button");
      btnBack.className = "shadcn-button ghost";
      btnBack.textContent = "Back to OTP";
      btnBack.style.cssText = "height:28px;font-size:0.75rem;";
      btnBack.onclick = () => {
        this.phoneStep = "otp";
        this.renderStepView();
      };
      wrap.appendChild(btnBack);
    }

    card.appendChild(wrap);
  }

  // --- TAB 3: SESSION STRING IMPORT ---
  renderSessionImportTab(card) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:12px;padding:4px 0;";

    const item = document.createElement("div");
    item.className = "shadcn-form-item";

    const label = document.createElement("label");
    label.className = "shadcn-label";
    label.textContent = "GramJS Session String";
    item.appendChild(label);

    const textarea = document.createElement("textarea");
    textarea.className = "shadcn-input";
    textarea.rows = 4;
    textarea.placeholder = "1BJWap1wB...";
    item.appendChild(textarea);
    wrap.appendChild(item);

    // Optional API ID / Hash accordion
    const det = document.createElement("details");
    det.style.cssText = "font-size:0.75rem;color:hsl(var(--muted-foreground));";
    const sum = document.createElement("summary");
    sum.style.cursor = "pointer";
    sum.textContent = "Override Custom API ID & Hash (Optional)";
    det.appendChild(sum);

    const box = document.createElement("div");
    box.style.cssText = "display:flex;flex-direction:column;gap:8px;padding-top:8px;";

    const idInp = document.createElement("input");
    idInp.className = "shadcn-input";
    idInp.placeholder = "Custom API ID";
    box.appendChild(idInp);

    const hashInp = document.createElement("input");
    hashInp.className = "shadcn-input";
    hashInp.placeholder = "Custom API Hash";
    box.appendChild(hashInp);
    det.appendChild(box);
    wrap.appendChild(det);

    const btnConnect = document.createElement("button");
    btnConnect.className = "shadcn-button";
    btnConnect.textContent = "Validate & Connect";
    btnConnect.onclick = async () => {
      const sess = textarea.value.trim();
      if (!sess) {
        this.showAlert("Please paste your session string.", "error");
        return;
      }
      btnConnect.disabled = true;
      btnConnect.textContent = "Connecting to MTProto...";

      if (idInp.value.trim() && hashInp.value.trim()) {
        await saveTgConfig(idInp.value.trim(), hashInp.value.trim());
      }

      try {
        await setSavedSession(sess);
        const ok = await tgStreamClient.init();
        if (ok) {
          this.goToStep2();
        } else {
          this.showAlert("Session string is invalid or expired.", "error");
          btnConnect.disabled = false;
          btnConnect.textContent = "Validate & Connect";
        }
      } catch (err) {
        this.showAlert(this.formatErrorMessage(err), "error");
        btnConnect.disabled = false;
        btnConnect.textContent = "Validate & Connect";
      }
    };
    wrap.appendChild(btnConnect);

    card.appendChild(wrap);
  }

  // =========================================================================
  // STEP 2: CHANNEL SELECTION WIZARD (All Channels Treated Uniformly)
  // =========================================================================
  async goToStep2() {
    this.step = 2;
    this.renderStepView();
    await this.fetchChannelsForWizard();
  }

  async fetchChannelsForWizard() {
    const card = this.container.querySelector("#auth-card-body");
    const listContainer = card.querySelector("#wizard-channel-list");
    if (!listContainer) return;

    listContainer.innerHTML = `<div style="text-align:center;padding:24px;color:hsl(var(--muted-foreground));font-size:0.85rem;">Discovering your Telegram chats & channels...</div>`;

    try {
      const { publicChannels, privateChannels } = await tgStreamClient.getUserChannels();
      // All channels are treated uniformly (no public vs private badges)
      this.discoveredChannels = [...publicChannels, ...privateChannels];

      if (this.selectedIds.size === 0) {
        for (const ch of this.discoveredChannels) {
          this.selectedIds.add(ch.id);
        }
      }

      this.renderChannelListItems();
    } catch (err) {
      listContainer.innerHTML = `<div style="text-align:center;padding:24px;color:#f87171;font-size:0.85rem;">Failed to load channels: ${err.message}</div>`;
    }
  }

  renderStep2ChannelWizard(card) {
    // Header
    const header = document.createElement("div");
    header.className = "shadcn-card-header";

    const badge = document.createElement("div");
    badge.className = "brand-badge-container";
    badge.appendChild(createIcon(Icons.Layers, { size: 22 }));
    header.appendChild(badge);

    const title = document.createElement("h1");
    title.className = "shadcn-card-title";
    title.textContent = "Select Channels for Your Drive";
    header.appendChild(title);

    const desc = document.createElement("p");
    desc.className = "shadcn-card-description";
    desc.textContent = "Choose which Telegram chats and channels to index into your Drive.";
    header.appendChild(desc);

    card.appendChild(header);

    // Search bar
    const searchWrap = document.createElement("div");
    searchWrap.style.cssText = "position:relative;margin:10px 0;";
    
    const sInput = document.createElement("input");
    sInput.className = "shadcn-input";
    sInput.placeholder = "Filter channels...";
    sInput.oninput = (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderChannelListItems();
    };
    searchWrap.appendChild(sInput);
    card.appendChild(searchWrap);

    // Bulk actions
    const toolbar = document.createElement("div");
    toolbar.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:6px 2px;font-size:0.775rem;";

    const counterSpan = document.createElement("span");
    counterSpan.id = "wizard-count-badge";
    counterSpan.style.color = "hsl(var(--muted-foreground))";
    counterSpan.textContent = `${this.selectedIds.size} channels selected`;
    toolbar.appendChild(counterSpan);

    const btnGroup = document.createElement("div");
    btnGroup.style.cssText = "display:flex;align-items:center;gap:6px;";

    const btnAll = document.createElement("button");
    btnAll.className = "shadcn-button ghost";
    btnAll.style.cssText = "height:24px;padding:0 8px;font-size:0.725rem;";
    btnAll.textContent = "Select All";
    btnAll.onclick = () => {
      for (const c of this.discoveredChannels) this.selectedIds.add(c.id);
      this.renderChannelListItems();
    };

    const btnClear = document.createElement("button");
    btnClear.className = "shadcn-button ghost";
    btnClear.style.cssText = "height:24px;padding:0 8px;font-size:0.725rem;";
    btnClear.textContent = "Clear";
    btnClear.onclick = () => {
      this.selectedIds.clear();
      this.renderChannelListItems();
    };

    btnGroup.appendChild(btnAll);
    btnGroup.appendChild(btnClear);
    toolbar.appendChild(btnGroup);
    card.appendChild(toolbar);

    // Channel list container
    const scrollList = document.createElement("div");
    scrollList.id = "wizard-channel-list";
    scrollList.style.cssText = "max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;border:1px solid hsl(var(--border));border-radius:var(--radius);padding:6px;background:hsl(var(--muted)/0.3);";
    card.appendChild(scrollList);

    // Bottom CTA
    const btnContinue = document.createElement("button");
    btnContinue.className = "shadcn-button";
    btnContinue.id = "btn-wizard-continue";
    btnContinue.style.marginTop = "12px";
    btnContinue.textContent = "Continue to Drive";
    btnContinue.disabled = this.selectedIds.size === 0;

    btnContinue.onclick = () => {
      const ids = Array.from(this.selectedIds);
      vaultStore.saveSelectedChannelIds(ids);
      vaultStore.setChannels(this.discoveredChannels);
      this.hide();
      if (this.onComplete) {
        this.onComplete(ids);
      }
    };

    card.appendChild(btnContinue);
  }

  renderChannelListItems() {
    const listContainer = this.container.querySelector("#wizard-channel-list");
    const countBadge = this.container.querySelector("#wizard-count-badge");
    const btnContinue = this.container.querySelector("#btn-wizard-continue");
    if (!listContainer) return;

    while (listContainer.firstChild) listContainer.removeChild(listContainer.firstChild);

    if (countBadge) countBadge.textContent = `${this.selectedIds.size} channels selected`;
    if (btnContinue) btnContinue.disabled = this.selectedIds.size === 0;

    const filtered = this.discoveredChannels.filter((c) => 
      c.title.toLowerCase().includes(this.searchQuery) ||
      (c.username && c.username.toLowerCase().includes(this.searchQuery))
    );

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:16px;text-align:center;color:hsl(var(--muted-foreground));font-size:0.8rem;";
      empty.textContent = "No channels match your filter.";
      listContainer.appendChild(empty);
      return;
    }

    for (const ch of filtered) {
      const isSelected = this.selectedIds.has(ch.id);

      const row = document.createElement("div");
      row.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:calc(var(--radius)-2px);border:1px solid ${isSelected ? "hsl(var(--ring))" : "transparent"};background:${isSelected ? "hsl(var(--secondary))" : "transparent"};cursor:pointer;transition:all 0.12s ease;`;

      const left = document.createElement("div");
      left.style.cssText = "display:flex;align-items:center;gap:10px;overflow:hidden;min-width:0;";

      const checkHolder = document.createElement("span");
      checkHolder.appendChild(createIcon(isSelected ? Icons.CheckSquare : Icons.Square, { size: 16 }));
      left.appendChild(checkHolder);

      const textWrap = document.createElement("div");
      textWrap.style.cssText = "display:flex;flex-direction:column;overflow:hidden;";
      
      const titleSpan = document.createElement("span");
      titleSpan.style.cssText = "font-size:0.8125rem;font-weight:500;color:hsl(var(--foreground));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      titleSpan.textContent = ch.title || "Untitled Channel";
      textWrap.appendChild(titleSpan);

      if (ch.username) {
        const uSpan = document.createElement("span");
        uSpan.style.cssText = "font-size:0.7rem;color:hsl(var(--muted-foreground));";
        uSpan.textContent = `@${ch.username}`;
        textWrap.appendChild(uSpan);
      }
      left.appendChild(textWrap);
      row.appendChild(left);

      row.onclick = () => {
        if (this.selectedIds.has(ch.id)) {
          this.selectedIds.delete(ch.id);
        } else {
          this.selectedIds.add(ch.id);
        }
        this.renderChannelListItems();
      };

      listContainer.appendChild(row);
    }
  }

  showAlert(msg, type = "info") {
    const alert = this.container.querySelector("#auth-step1-alert");
    if (!alert) return;
    alert.textContent = msg;
    alert.className = `shadcn-alert ${type}`;
    alert.classList.remove("hidden");
  }

  formatErrorMessage(err) {
    const msg = String(err.errorMessage || err.message || err);
    if (msg.includes("PHONE_NUMBER_INVALID")) return "The phone number entered is invalid.";
    if (msg.includes("PHONE_CODE_EXPIRED")) return "The verification code has expired. Please request a new code.";
    if (msg.includes("PHONE_CODE_INVALID")) return "Invalid verification code entered.";
    if (msg.includes("PASSWORD_HASH_INVALID")) return "Incorrect 2-Step Verification password.";
    if (msg.includes("FLOOD_WAIT_")) {
      const seconds = msg.match(/FLOOD_WAIT_(\d+)/)?.[1] || "60";
      return `Rate limited by Telegram. Please wait ${seconds} seconds before trying again.`;
    }
    return msg;
  }

  bindEvents() {}
}
