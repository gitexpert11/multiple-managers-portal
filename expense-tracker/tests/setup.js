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
// No 2D canvas in jsdom: return null so the chart component skips Chart.js
// (it still renders its HTML legend) instead of logging "not implemented".
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => null;
}
