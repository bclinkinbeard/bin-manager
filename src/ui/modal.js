function createConfirmAction(getById) {
  return function confirmAction({ title, message, confirmLabel, danger }) {
    return new Promise((resolve) => {
      getById('modal-title').textContent = title || 'Confirm';
      getById('modal-message').textContent = message || 'Are you sure?';
      const confirmBtn = getById('modal-confirm');
      confirmBtn.textContent = confirmLabel || 'Confirm';
      confirmBtn.className = danger === false ? 'btn btn-primary' : 'btn btn-danger';
      getById('modal-overlay').classList.add('active');

      function cleanup() {
        getById('modal-overlay').classList.remove('active');
        confirmBtn.removeEventListener('click', onConfirm);
        getById('modal-cancel').removeEventListener('click', onCancel);
      }

      function onConfirm() {
        cleanup();
        resolve(true);
      }

      function onCancel() {
        cleanup();
        resolve(false);
      }

      confirmBtn.addEventListener('click', onConfirm);
      getById('modal-cancel').addEventListener('click', onCancel);
    });
  };
}

export { createConfirmAction };
