(() => {
  const toggle = document.querySelector('.menu-button');
  const nav = document.querySelector('#site-nav');
  const mobile = window.matchMedia('(max-width: 760px)');
  const setMenu = (open, returnFocus = false) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    nav.hidden = mobile.matches && !open;
    if (returnFocus) toggle.focus();
  };
  const adaptMenu = () => {
    const hiddenFocus = mobile.matches && nav.contains(document.activeElement);
    toggle.hidden = !mobile.matches;
    setMenu(false, hiddenFocus);
  };
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setMenu(false, true);
    }
  });
  document.addEventListener('click', event => {
    if (mobile.matches && toggle.getAttribute('aria-expanded') === 'true' && !event.target.closest('.header-inner')) {
      setMenu(false, nav.contains(document.activeElement));
    }
  });
  nav.addEventListener('click', event => { if (event.target.closest('a') && mobile.matches) setMenu(false); });
  mobile.addEventListener('change', adaptMenu);
  adaptMenu();

  const form = document.querySelector('#enquiry-form');
  if (!form) return;
  const service = form.elements.service;
  const requestedService = new URLSearchParams(location.search).get('service');
  if (['accounting', 'taxation', 'audit', 'advisory', 'unsure'].includes(requestedService)) service.value = requestedService;
  const fields = ['name', 'email', 'service', 'message'].map(id => document.getElementById(id));
  const status = document.querySelector('#form-status');
  const button = document.querySelector('#preview-button');
  button.disabled = false;
  let checked = false;
  const validate = field => {
    let error = '';
    if (!field.value.trim()) error = ({name: 'Enter your name.', email: 'Enter your email address.', service: 'Choose an area of interest.', message: 'Add a brief message.'})[field.id];
    else if (field.id === 'email' && (field.validity.typeMismatch || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim()))) error = 'Enter an email address such as name@example.com.';
    document.getElementById(`${field.id}-error`).textContent = error;
    field.setAttribute('aria-invalid', String(Boolean(error)));
    return !error;
  };
  const check = () => {
    checked = true;
    const results = fields.map(validate);
    const invalid = fields.filter((_, index) => !results[index]);
    status.textContent = invalid.length ? `Please correct ${invalid.length} ${invalid.length === 1 ? 'field' : 'fields'} highlighted above. Nothing has been sent.` : 'Preview complete: the fields look valid. Nothing has been sent or saved. No delivery destination is configured.';
    status.classList.toggle('valid', !invalid.length);
    if (invalid.length) invalid[0].focus();
  };
  form.addEventListener('submit', event => { event.preventDefault(); check(); });
  button.addEventListener('click', check);
  fields.forEach(field => {
    field.addEventListener('input', () => {
      if (checked) {
        validate(field);
        status.textContent = 'Preview edited. Check the fields again. Nothing has been sent or saved.';
        status.classList.remove('valid');
      }
    });
  });
})();
