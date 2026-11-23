// ConferenceHub: passwordless email code sign-in. Enabled only after sender review.
"use strict";
(() => {
  const RESEND_WAIT_MS = 60_000;

  function emailError(error, phase) {
    const code = String(error?.code || "").toLowerCase();
    const text = String(error?.message || "").toLowerCase();
    if (/rate_limit|too_many_requests|429/.test(code) || /rate limit|too many requests|after 60 seconds|seconds.*wait/.test(text)) {
      return "For mange forsøg. Vent mindst ét minut, før du prøver igen.";
    }
    if (phase === "verify" && (/expired|invalid|token/.test(code) || /expired|invalid|token|otp/.test(text))) {
      return "Koden er forkert eller udløbet. Kontrollér koden, eller bed om en ny.";
    }
    if (phase === "send" && (/email_address_invalid/.test(code) || /invalid email/.test(text))) {
      return "E-mailadressen er ikke gyldig. Kontrollér adressen og prøv igen.";
    }
    return phase === "verify"
      ? "Kunne ikke kontrollere koden. Prøv igen eller bed om en ny kode."
      : "Kunne ikke sende en kode. Kontrollér adressen og prøv senere.";
  }

  function setup(auth, doc = document, clock = {}) {
    const get = (id) => doc.getElementById(id);
    const form = get("login-email");
    const verifyForm = get("login-email-verify");
    const emailInput = get("login-email-input");
    const codeInput = get("login-email-code");
    const sendButton = get("login-email-send");
    const verifyButton = get("login-email-confirm");
    const resendButton = get("login-email-resend");
    const resetButton = get("login-email-reset");
    const target = get("login-email-target");
    const message = get("login-msg");
    if (![form, verifyForm, emailInput, codeInput, sendButton, verifyButton, resendButton, resetButton, target, message].every(Boolean)) {
      throw new Error("Email login form is incomplete");
    }

    const now = clock.now || (() => Date.now());
    const startInterval = clock.setInterval || ((fn, ms) => setInterval(fn, ms));
    const stopInterval = clock.clearInterval || ((id) => clearInterval(id));
    let pendingEmail = "";
    let lastSentEmail = "";
    let resendAvailableAt = 0;
    let timer = null;
    let sending = false;
    let verifying = false;

    function updateResend() {
      const remaining = Math.max(0, Math.ceil((resendAvailableAt - now()) / 1000));
      resendButton.textContent = remaining ? `Send ny kode (${remaining} s)` : "Send ny kode";
      resendButton.disabled = remaining > 0 || sending || verifying;
      if (!remaining && timer !== null) {
        stopInterval(timer);
        timer = null;
      }
      return remaining;
    }

    function countdown() {
      if (timer !== null) stopInterval(timer);
      timer = startInterval(updateResend, 1000);
      updateResend();
    }

    async function sendCode(email) {
      if (sending || verifying || !email) return;
      const remaining = lastSentEmail === email ? Math.max(0, Math.ceil((resendAvailableAt - now()) / 1000)) : 0;
      if (remaining > 0) {
        message.textContent = `Vent ${remaining} sekunder, før du beder om en ny kode.`;
        updateResend();
        return;
      }
      sending = true;
      sendButton.disabled = true;
      resendButton.disabled = true;
      message.textContent = "Sender engangskode…";
      try {
        const { error } = await auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        if (error) throw error;
        pendingEmail = email;
        lastSentEmail = email;
        resendAvailableAt = now() + RESEND_WAIT_MS;
        target.textContent = email;
        form.hidden = true;
        verifyForm.hidden = false;
        codeInput.value = "";
        codeInput.focus();
        message.textContent = "Koden er sendt. Den er gyldig i 10 minutter.";
        countdown();
      } catch (error) {
        message.textContent = emailError(error, "send");
      } finally {
        sending = false;
        sendButton.disabled = false;
        updateResend();
      }
    }

    function reset({ focus = true } = {}) {
      pendingEmail = "";
      codeInput.value = "";
      form.hidden = false;
      verifyForm.hidden = true;
      message.textContent = "";
      verifyButton.disabled = false;
      if (timer !== null) { stopInterval(timer); timer = null; }
      // Keep the last-send timestamp so reopening the dialog cannot bypass cooldown.
      updateResend();
      if (focus) emailInput.focus();
    }

    form.onsubmit = async (event) => {
      event.preventDefault();
      await sendCode(emailInput.value.trim());
    };

    resendButton.onclick = async () => {
      if (pendingEmail) await sendCode(pendingEmail);
    };

    verifyForm.onsubmit = async (event) => {
      event.preventDefault();
      const token = codeInput.value.trim();
      if (verifying || sending) return;
      if (!pendingEmail || !/^\d{6}$/.test(token)) {
        message.textContent = "Skriv den sekscifrede kode fra din mail.";
        return;
      }
      verifying = true;
      verifyButton.disabled = true;
      updateResend();
      message.textContent = "Kontrollerer engangskode…";
      try {
        const { error } = await auth.verifyOtp({ email: pendingEmail, token, type: "email" });
        if (error) throw error;
        message.textContent = "Du er logget ind.";
      } catch (error) {
        message.textContent = emailError(error, "verify");
      } finally {
        verifying = false;
        verifyButton.disabled = false;
        updateResend();
      }
    };

    resetButton.onclick = () => reset();
    form.hidden = false;
    verifyForm.hidden = true;
    updateResend();
    return { reset };
  }

  window.CHEmailLogin = { setup };
})();
