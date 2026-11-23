// ConferenceHub: passwordless email code sign-in. Enabled only when a verified email sender is configured.
"use strict";
(() => {
  function setup(auth, doc = document) {
    const form = doc.getElementById("login-email");
    const verifyForm = doc.getElementById("login-email-verify");
    const emailInput = doc.getElementById("login-email-input");
    const codeInput = doc.getElementById("login-email-code");
    const sendButton = doc.getElementById("login-email-send");
    const verifyButton = doc.getElementById("login-email-confirm");
    const resetButton = doc.getElementById("login-email-reset");
    const message = doc.getElementById("login-msg");
    if (![form, verifyForm, emailInput, codeInput, sendButton, verifyButton, resetButton, doc.getElementById("login-email-target"), message].every(Boolean)) {
      throw new Error("Email login form is incomplete");
    }

    let pendingEmail = "";
    form.hidden = false;
    verifyForm.hidden = true;

    form.onsubmit = async (event) => {
      event.preventDefault();
      const email = emailInput.value.trim();
      if (!email) return;
      sendButton.disabled = true;
      message.textContent = "Sender engangskode…";
      try {
        const { error } = await auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true },
        });
        if (error) throw error;
        pendingEmail = email;
        doc.getElementById("login-email-target").textContent = email;
        form.hidden = true;
        verifyForm.hidden = false;
        codeInput.value = "";
        codeInput.focus();
        message.textContent = "Indtast den sekscifrede kode fra din mail.";
      } catch (error) {
        message.textContent = `Kunne ikke sende engangskoden: ${error?.message || "Prøv igen senere."}`;
      } finally {
        sendButton.disabled = false;
      }
    };

    verifyForm.onsubmit = async (event) => {
      event.preventDefault();
      const token = codeInput.value.trim();
      if (!pendingEmail || !/^\\d{6}$/.test(token)) {
        message.textContent = "Skriv den sekscifrede kode fra din mail.";
        return;
      }
      verifyButton.disabled = true;
      message.textContent = "Kontrollerer engangskode…";
      try {
        const { error } = await auth.verifyOtp({ email: pendingEmail, token, type: "email" });
        if (error) throw error;
        message.textContent = "Du er logget ind.";
      } catch (error) {
        message.textContent = `Kunne ikke logge ind: ${error?.message || "Prøv en ny kode."}`;
      } finally {
        verifyButton.disabled = false;
      }
    };

    resetButton.onclick = () => {
      pendingEmail = "";
      codeInput.value = "";
      verifyForm.hidden = true;
      form.hidden = false;
      message.textContent = "";
      emailInput.focus();
    };
  }

  window.CHEmailLogin = { setup };
})();
