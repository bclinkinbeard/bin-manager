function createToast(getById) {
  return function showToast(message, type) {
    const toast = getById('toast');
    toast.textContent = message;
    toast.className = 'toast visible' + (type ? ` toast-${type}` : '');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.className = 'toast';
    }, 2500);
  };
}

export { createToast };
