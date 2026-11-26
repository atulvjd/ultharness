// Simple smooth scroll for anchor links
document.addEventListener('DOMContentLoaded', function() {
  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Mobile menu toggle
  const menuButton = document.querySelector('.menu-button');
  const navLinks = document.querySelector('.nav-links');
  
  if (menuButton && navLinks) {
    menuButton.addEventListener('click', function() {
      const isOpen = navLinks.classList.toggle('open');
      // Toggle aria state
      const ariaExpanded = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', !ariaExpanded);
    });
  }

  // Form validation feedback
  const form = document.querySelector('.contact-form');
  if (form) {
    form.addEventListener('submit', function(e) {
      const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
      let isValid = true;
      
      inputs.forEach(input => {
        if (!input.checkValidity()) {
          isValid = false;
          input.reportValidity();
        }
      });
      
      if (isValid) {
        // Show success message (placeholder - no actual submission)
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Message sent!';
        submitBtn.disabled = true;
        
        setTimeout(() => {
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
          form.reset();
        }, 3000);
      }
    });
    
    // Real-time validation feedback
    const formInputs = form.querySelectorAll('input, select, textarea');
    formInputs.forEach(input => {
      input.addEventListener('blur', function() {
        if (this.hasAttribute('required') && this.value.trim() === '') {
          this.style.borderColor = '#e0a890';
        }
      });
      
      input.addEventListener('input', function() {
        if (this.checkValidity()) {
          this.style.borderColor = '';
        }
      });
    });
  }
});
