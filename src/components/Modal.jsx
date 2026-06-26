export default function Modal({ open, onClose, children, labelledBy = 'modalTitle' }) {
  if (!open) return null;
  return (
    <div className="modal is-open" aria-hidden="false">
      <div className="modal__overlay" onClick={onClose}></div>
      <section className="modal__panel" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <button className="modal__close" type="button" onClick={onClose} aria-label="Cerrar">×</button>
        {children}
      </section>
    </div>
  );
}
