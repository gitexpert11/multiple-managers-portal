// jsdom lacks a few browser APIs the app touches; stub them so components mount.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function () {
    this.removeAttribute('open');
  };
}
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView ??= () => {};
}
if (typeof URL !== 'undefined') {
  URL.createObjectURL ??= () => 'blob:mock';
  URL.revokeObjectURL ??= () => {};
}
