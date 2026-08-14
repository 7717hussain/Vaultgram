import { tgStreamClient } from "../telegram/client.js";
import { getSavedSession, saveSession, clearSession, getTgConfig, saveTgConfig } from "../telegram/session.js";
import { vaultStore } from "../catalog/vaultStore.js";
import { createIcon, Icons } from "./icons.js";

/**
 * 3-Step Onboarding Wizard
 * Step 1: Clean Minimalist Login Screen (Phone -> Code -> 2FA or Session String)
 * Step 2: Channel Selection Wizard (Search, Multi-select, Select All, No Public/Private distinction)
 * Step 3: Main Dashboard (Triggers callback)
 */
export class AuthModal {
  constructor(containerEl, onComplete) {
    this.container = containerEl;
    this.onComplete = onComplete;
    this.step = 1; // 1: Login, 2: Channel Wizard
    this.tab = "phone"; // 'phone' | 'session'
    this.phoneCodeHash = null;
    this.phoneNumber = "";
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
    const backdrop = this.container.querySelector("#auth-wizard-backdrop");
    if (backdrop) backdrop.classList.add("hidden");
  }

  render() {
    this.container.innerHTML = `
      <div class="login-page-container" id="auth-wizard-backdrop">
        <div class="shadcn-card" id="auth-card-body">
          <!-- Dynamically Rendered Step Views -->
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
      this.renderStep1Login(card);
    } else if (this.step === 2) {
      this.renderStep2ChannelWizard(card);
    }
  }

  // --- STEP 1: LOGIN ---
  renderStep1Login(card) {
    // Header
    const header = document.createElement("div");
    header.className = "shadcn-card-header";

    const badge = document.createElement("div");
    badge.className = "brand-badge-container";
    badge.appendChild(createIcon(Icons.HardDrive, { size: 22 }));
    header.appendChild(badge);

    const title = document.createElement("h1");
    title.className = "shadcn-card-title";
    title.textContent = "Televault";
    header.appendChild(title);

    const desc = document.createElement("p");
    desc.className = "shadcn-card-description";
    desc.textContent = "Telegram-backed decentralized cloud storage drive. Client-side & private.";
    header.appendChild(desc);

    card.appendChild(header);

    // Status Banner
    const statusBox = document.createElement("div");
    statusBox.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:hsl(var(--muted));border:1px solid hsl(var(--border));border-radius:var(--radius);margin:10px 0;";
    
    const statusInd = document.createElement("div");
    statusInd.className = "status-indicator";
    const dot = document.createElement("span");
    dot.className = "status-dot disconnected";
    statusInd.appendChild(dot);
    const statTxt = document.createElement("span");
    statTxt.style.fontSize = "0.8rem";
    statTxt.textContent = "Not Connected";
    statusInd.appendChild(statTxt);
    statusBox.appendChild(statusInd);

    card.appendChild(statusBox);

    // Tabs
    const tabsList = document.createElement("div");
    tabsList.className = "shadcn-tabs-list";

    const tabPhone = document.createElement("button");
    tabPhone.className = `shadcn-tab-trigger ${this.tab === "phone" ? "active" : ""}`;
    tabPhone.appendChild(createIcon(Icons.Smartphone, { size: 14 }));
    const pSpan = document.createElement("span");
    pSpan.textContent = "Phone OTP";
    tabPhone.appendChild(pSpan);
    tabPhone.onclick = () => { this.tab = "phone"; this.renderStepView(); };

    const tabSession = document.createElement("button");
    tabSession.className = `shadcn-tab-trigger ${this.tab === "session" ? "active" : ""}`;
    tabSession.appendChild(createIcon(Icons.Key, { size: 14 }));
    const sSpan = document.createElement("span");
    sSpan.textContent = "Session String";
    tabSession.appendChild(sSpan);
    tabSession.onclick = () => { this.tab = "session"; this.renderStepView(); };

    tabsList.appendChild(tabPhone);
    tabsList.appendChild(tabSession);
    card.appendChild(tabsList);

    // Alerts
    const alertDiv = document.createElement("div");
    alertDiv.id = "step1-alert";
    alertDiv.className = "shadcn-alert hidden";
    card.appendChild(alertDiv);

    if (this.tab === "phone") {
      this.renderPhoneForm(card);
    } else {
      this.renderSessionForm(card);
    }

    // Credentials Config Accordion
    this.renderCustomConfigSection(card);
  }

  renderPhoneForm(card) {
    const form = document.createElement("div");
    form.style.display = "flex";
    form.style.flexDirection = "column";
    form.style.gap = "12px";

    // Phone Input
    const phoneGroup = document.createElement("div");
    phoneGroup.className = "shadcn-form-item";
    const pLabel = document.createElement("label");
    pLabel.className = "shadcn-label";
    pLabel.textContent = "Phone Number (with country code)";
    const pInput = document.createElement("input");
    pInput.className = "shadcn-input";
    pInput.id = "auth-phone-input";
    pInput.placeholder = "+1234567890";
    phoneGroup.appendChild(pLabel);
    phoneGroup.appendChild(pInput);
    form.appendChild(phoneGroup);

    const btnSendCode = document.createElement("button");
    btnSendCode.className = "shadcn-button";
    btnSendCode.id = "btn-send-code";
    btnSendCode.textContent = "Send Verification Code";
    btnSendCode.onclick = async () => {
      const phone = pInput.value.trim();
      if (!phone) {
        this.showAlert("Please enter your phone number with country code.", "error");
        return;
      }
      btnSendCode.disabled = true;
      btnSendCode.textContent = "Sending Code...";
      try {
        const res = await tgStreamClient.sendPhoneCode(phone);
        this.phoneCodeHash = res.phoneCodeHash;
        this.phoneNumber = phone;
        this.showAlert("Code sent! Check your Telegram messages.", "success");
        codeGroup.classList.remove("hidden");
        btnSignIn.classList.remove("hidden");
        btnSendCode.classList.add("hidden");
      } catch (err) {
        this.showAlert(err.message || "Failed to send code. Check API credentials.", "error");
        btnSendCode.disabled = false;
        btnSendCode.textContent = "Send Verification Code";
      }
    };
    form.appendChild(btnSendCode);

    // Code Input (Hidden initially)
    const codeGroup = document.createElement("div");
    codeGroup.className = "shadcn-form-item hidden";
    codeGroup.id = "group-otp-code";
    const cLabel = document.createElement("label");
    cLabel.className = "shadcn-label";
    cLabel.textContent = "Telegram Verification Code";
    const cInput = document.createElement("input");
    cInput.className = "shadcn-input";
    cInput.id = "auth-otp-input";
    cInput.placeholder = "12345";
    codeGroup.appendChild(cLabel);
    codeGroup.appendChild(cInput);
    form.appendChild(codeGroup);

    const btnSignIn = document.createElement("button");
    btnSignIn.className = "shadcn-button hidden";
    btnSignIn.id = "btn-phone-signin";
    btnSignIn.textContent = "Sign In to Televault";
    btnSignIn.onclick = async () => {
      const code = cInput.value.trim();
      if (!code) {
        this.showAlert("Please enter the verification code received on Telegram.", "error");
        return;
      }
      btnSignIn.disabled = true;
      btnSignIn.textContent = "Signing In...";
      try {
        await tgStreamClient.signInWithPhone(this.phoneNumber, code, this.phoneCodeHash);
        this.goToStep2();
      } catch (err) {
        if (err.message && err.message.includes("SESSION_PASSWORD_NEEDED")) {
          const pass = prompt("Your Telegram account has 2-Step Verification enabled. Enter your Cloud Password:");
          if (pass) {
            try {
              await tgStreamClient.handle2FAPassword(pass);
              this.goToStep2();
              return;
            } catch (pErr) {
              this.showAlert(pErr.message || "2FA Verification failed.", "error");
            }
          }
        } else {
          this.showAlert(err.message || "Sign in failed.", "error");
        }
        btnSignIn.disabled = false;
        btnSignIn.textContent = "Sign In to Televault";
      }
    };
    form.appendChild(btnSignIn);

    card.appendChild(form);
  }

  renderSessionForm(card) {
    const form = document.createElement("div");
    form.style.display = "flex";
    form.style.flexDirection = "column";
    form.style.gap = "12px";

    const sGroup = document.createElement("div");
    sGroup.className = "shadcn-form-item";
    const sLabel = document.createElement("label");
    sLabel.className = "shadcn-label";
    sLabel.textContent = "GramJS Session String";
    const sInput = document.createElement("textarea");
    sInput.className = "shadcn-input";
    sInput.id = "auth-session-input";
    sInput.rows = 4;
    sInput.placeholder = "1BJWap1wB...";
    sGroup.appendChild(sLabel);
    sGroup.appendChild(sInput);
    form.appendChild(sGroup);

    const btnSessionLogin = document.createElement("button");
    btnSessionLogin.className = "shadcn-button";
    btnSessionLogin.textContent = "Connect with Session String";
    btnSessionLogin.onclick = async () => {
      const sess = sInput.value.trim();
      if (!sess) {
        this.showAlert("Please paste your Telegram StringSession.", "error");
        return;
      }
      btnSessionLogin.disabled = true;
      btnSessionLogin.textContent = "Connecting...";
      try {
        saveSession(sess);
        await tgStreamClient.init();
        this.goToStep2();
      } catch (err) {
        this.showAlert(err.message || "Invalid session string.", "error");
        btnSessionLogin.disabled = false;
        btnSessionLogin.textContent = "Connect with Session String";
      }
    };
    form.appendChild(btnSessionLogin);

    card.appendChild(form);
  }

  renderCustomConfigSection(card) {
    const config = getTgConfig();
    const det = document.createElement("details");
    det.style.cssText = "font-size:0.775rem;margin-top:12px;color:hsl(var(--muted-foreground));";
    
    const sum = document.createElement("summary");
    sum.style.cursor = "pointer";
    sum.textContent = "Custom Telegram API Keys (Optional)";
    det.appendChild(sum);

    const box = document.createElement("div");
    box.style.cssText = "display:flex;flex-direction:column;gap:8px;padding-top:8px;";

    const idInp = document.createElement("input");
    idInp.className = "shadcn-input";
    idInp.placeholder = "Custom API ID (e.g. 123456)";
    idInp.value = config.apiId || "";
    box.appendChild(idInp);

    const hashInp = document.createElement("input");
    hashInp.className = "shadcn-input";
    hashInp.placeholder = "Custom API Hash";
    hashInp.value = config.apiHash || "";
    box.appendChild(hashInp);

    const btnSaveCfg = document.createElement("button");
    btnSaveCfg.className = "shadcn-button ghost";
    btnSaveCfg.textContent = "Save API Keys";
    btnSaveCfg.style.height = "28px";
    btnSaveCfg.onclick = () => {
      saveTgConfig(idInp.value.trim(), hashInp.value.trim());
      alert("Custom Telegram API Keys saved locally!");
    };
    box.appendChild(btnSaveCfg);

    det.appendChild(box);
    card.appendChild(det);
  }

  // --- STEP 2: CHANNEL SELECTION WIZARD ---
  async goToStep2() {
    this.step = 2;
    this.renderStepView();
    await this.fetchChannelsForWizard();
  }

  async fetchChannelsForWizard() {
    const card = this.container.querySelector("#auth-card-body");
    const listContainer = card.querySelector("#wizard-channel-list");
    if (!listContainer) return;

    listContainer.innerHTML = `<div style="text-align:center;padding:24px;color:hsl(var(--muted-foreground));font-size:0.85rem;">Discovering your Telegram channels...</div>`;

    try {
      const { publicChannels, privateChannels } = await tgStreamClient.getUserChannels();
      // All channels are treated uniformly (no public vs private distinction)
      this.discoveredChannels = [...publicChannels, ...privateChannels];

      // Auto-select all by default if no selection saved
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

    // Bulk action toolbar: Select All / Clear + Selection Counter
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

    // Channels Scroll List Container
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
      empty.textContent = "No channels match your search.";
      listContainer.appendChild(empty);
      return;
    }

    for (const ch of filtered) {
      const isSelected = this.selectedIds.has(ch.id);

      const row = document.createElement("div");
      row.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:calc(var(--radius)-2px);border:1px solid ${isSelected ? "hsl(var(--ring))" : "transparent"};background:${isSelected ? "hsl(var(--secondary))" : "transparent"};cursor:pointer;transition:all 0.12s ease;`;

      const left = document.createElement("div");
      left.style.cssText = "display:flex;align-items:center;gap:10px;overflow:hidden;min-width:0;";

      // Checkbox icon
      const checkHolder = document.createElement("span");
      checkHolder.appendChild(createIcon(isSelected ? Icons.CheckSquare : Icons.Square, { size: 16 }));
      left.appendChild(checkHolder);

      // Channel title & subtitle
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
    const alert = this.container.querySelector("#step1-alert");
    if (!alert) return;
    alert.textContent = msg;
    alert.className = `shadcn-alert ${type}`;
    alert.classList.remove("hidden");
  }

  bindEvents() {}
}
