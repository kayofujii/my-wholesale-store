import { CartAddEvent } from '@theme/events';

class CardBuyPopup {
  constructor() {
    this.popup = document.getElementById('card-buy-popup');
    if (!(this.popup instanceof HTMLElement)) return;

    this.form = this.popup.querySelector('[data-card-buy-form]');
    this.optionsContainer = this.popup.querySelector('[data-card-buy-options]');
    this.title = this.popup.querySelector('[data-card-buy-title]');
    this.quantityInput = this.popup.querySelector('[data-card-buy-quantity]');
    this.quantitySelector = this.popup.querySelector('quantity-selector-component');
    this.error = this.popup.querySelector('[data-card-buy-error]');
    this.submitButton = this.popup.querySelector('[data-card-buy-submit]');

    this.product = null;
    this.currentVariant = null;
    this.activeTrigger = null;

    document.addEventListener('click', this.handleDocumentClick);
    document.addEventListener('keydown', this.handleKeydown);
    window.addEventListener('resize', this.handleViewportChange);
    window.addEventListener('scroll', this.handleViewportChange, true);

    this.popup.querySelector('[data-card-buy-close]')?.addEventListener('click', () => this.close());
    this.form?.addEventListener('submit', this.handleSubmit);
  }

  handleDocumentClick = async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const trigger = target.closest('.card-buy-popup-trigger');
    if (trigger instanceof HTMLElement) {
      event.preventDefault();
      const handle = trigger.dataset.productHandle;
      const title = trigger.dataset.productTitle || '';
      if (!handle) return;

      await this.open(handle, title, trigger);
      return;
    }

    if (!this.isOpen()) return;

    if (!this.popup.contains(target)) {
      this.close();
    }
  };

  handleKeydown = (event) => {
    if (event.key === 'Escape' && this.isOpen()) {
      this.close();
    }
  };

  handleViewportChange = () => {
    if (this.isOpen()) {
      this.positionPopup();
    }
  };

  async open(handle, fallbackTitle = '', trigger) {
    try {
      this.activeTrigger = trigger;
      this.clearError();
      this.setBusy(true);
      this.product = await this.fetchProduct(handle);
      this.render(fallbackTitle);
      this.show();
      this.positionPopup();
      this.activeTrigger.setAttribute('aria-expanded', 'true');
    } catch (error) {
      console.error('Failed to open card buy popup:', error);
      this.showError('Unable to load product options.');
    } finally {
      this.setBusy(false);
    }
  }

  show() {
    this.popup.classList.remove('hidden');
  }

  close() {
    if (this.activeTrigger instanceof HTMLElement) {
      this.activeTrigger.setAttribute('aria-expanded', 'false');
      this.activeTrigger.focus();
    }

    this.popup.classList.add('hidden');
    this.activeTrigger = null;
    this.clearPositionStyles();
  }

  isOpen() {
    return !this.popup.classList.contains('hidden');
  }

  positionPopup() {
    if (!(this.activeTrigger instanceof HTMLElement)) return;

    const productCard = this.activeTrigger.closest('product-card');
    if (!(productCard instanceof HTMLElement)) return;

    const cardRect = productCard.getBoundingClientRect();
    const margin = 12;
    const gapFromCard = 8;
    const isMobile = window.innerWidth < 750;

    // Desktop: match product card width. Mobile: cap width and center.
    const popupWidth = isMobile
      ? Math.min(420, window.innerWidth - margin * 2)
      : Math.min(cardRect.width, window.innerWidth - margin * 2);
    this.popup.style.width = `${popupWidth}px`;

    // Measure after width is applied to get accurate height.
    const measuredHeight = this.popup.scrollHeight;
    const popupHeight = Math.min(measuredHeight, window.innerHeight - margin * 2);

    const left = isMobile
      ? Math.max(margin, (window.innerWidth - popupWidth) / 2)
      : Math.min(window.innerWidth - popupWidth - margin, Math.max(margin, cardRect.left));

    // Prefer below card; clamp into viewport if there's not enough space.
    let top = cardRect.bottom + gapFromCard;
    if (top + popupHeight > window.innerHeight - margin) {
      top = window.innerHeight - popupHeight - margin;
    }
    if (top < margin) {
      top = margin;
    }

    this.popup.style.left = `${left}px`;
    this.popup.style.top = `${top}px`;
    this.popup.style.maxHeight = `${popupHeight}px`;
  }

  clearPositionStyles() {
    this.popup.style.removeProperty('left');
    this.popup.style.removeProperty('top');
    this.popup.style.removeProperty('width');
    this.popup.style.removeProperty('max-height');
  }

  async fetchProduct(handle) {
    const response = await fetch(`${window.Shopify.routes.root}products/${handle}.js`);
    if (!response.ok) {
      throw new Error(`Failed to fetch product JSON: ${response.status}`);
    }

    return response.json();
  }

  render(fallbackTitle) {
    if (!this.product || !(this.optionsContainer instanceof HTMLElement)) return;

    if (this.title instanceof HTMLElement) {
      this.title.textContent = this.product.title || fallbackTitle;
    }

    this.optionsContainer.innerHTML = '';

    const hasOptions = Array.isArray(this.product.options) && this.product.options.length > 0;
    if (hasOptions) {
      this.product.options.forEach((optionEntry, optionIndex) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'card-buy-popup__field';

        const id = `card-buy-option-${optionIndex}`;

        const label = document.createElement('label');
        label.setAttribute('for', id);
        label.textContent = this.getOptionName(optionEntry, optionIndex);

        const select = document.createElement('select');
        select.id = id;
        select.name = `option-${optionIndex + 1}`;

        const values = this.uniqueOptionValues(optionIndex, optionEntry);
        for (const value of values) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          select.appendChild(option);
        }

        select.addEventListener('change', this.handleOptionChange);

        wrapper.appendChild(label);
        wrapper.appendChild(select);
        this.optionsContainer.appendChild(wrapper);
      });
    }

    if (this.quantityInput instanceof HTMLInputElement) {
      this.quantityInput.value = '1';
    }

    this.syncVariantFromSelection();
  }

  getOptionName(optionEntry, optionIndex) {
    if (typeof optionEntry === 'string') return optionEntry;
    if (optionEntry && typeof optionEntry === 'object' && typeof optionEntry.name === 'string') {
      return optionEntry.name;
    }

    return `Option ${optionIndex + 1}`;
  }

  uniqueOptionValues(optionIndex, optionEntry) {
    if (
      optionEntry &&
      typeof optionEntry === 'object' &&
      Array.isArray(optionEntry.values) &&
      optionEntry.values.length > 0
    ) {
      return optionEntry.values.filter((value) => typeof value === 'string');
    }

    if (!Array.isArray(this.product?.variants)) return [];

    const key = `option${optionIndex + 1}`;
    const values = new Set();
    for (const variant of this.product.variants) {
      const value = variant[key];
      if (value) values.add(value);
    }

    return Array.from(values);
  }

  handleOptionChange = () => {
    this.syncVariantFromSelection();
  };

  selectedOptions() {
    if (!(this.optionsContainer instanceof HTMLElement)) return [];

    return Array.from(this.optionsContainer.querySelectorAll('select')).map((select) => {
      return select instanceof HTMLSelectElement ? select.value : '';
    });
  }

  syncVariantFromSelection() {
    if (!this.product) return;

    const selectedOptions = this.selectedOptions();
    const variants = Array.isArray(this.product.variants) ? this.product.variants : [];

    const matched = variants.find((variant) => {
      return selectedOptions.every((value, index) => {
        const key = `option${index + 1}`;
        return variant[key] === value;
      });
    });

    this.currentVariant = matched || null;
    this.updateQuantityConstraints();

    if (!(this.submitButton instanceof HTMLButtonElement)) return;

    const canAdd = Boolean(this.currentVariant?.available);
    this.submitButton.disabled = !canAdd;

    if (!canAdd) {
      this.showError('Selected variant is unavailable.');
    } else {
      this.clearError();
    }
  }

  handleSubmit = async (event) => {
    event.preventDefault();

    if (!this.currentVariant) {
      this.showError('Please choose a valid variant.');
      return;
    }

    const quantity = this.getQuantity();
    if (quantity < 1) {
      this.showError('Quantity must be at least 1.');
      return;
    }

    this.clearError();
    this.setBusy(true);

    try {
      const sectionIds = this.getCartSectionIds();
      const payload = {
        items: [{ id: this.currentVariant.id, quantity }],
      };

      if (sectionIds.length > 0) {
        payload.sections = sectionIds.join(',');
        payload.sections_url = window.location.pathname;
      }

      const response = await fetch(`${window.Shopify.routes.root}cart/add.js`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || data.status) {
        throw new Error(data.description || data.message || 'Failed to add to cart.');
      }

      document.dispatchEvent(
        new CartAddEvent(data, 'card-buy-popup', {
          source: 'card-buy-popup',
          itemCount: quantity,
          variantId: String(this.currentVariant.id),
          sections: data.sections,
        })
      );

      this.close();
    } catch (error) {
      this.showError(error instanceof Error ? error.message : 'Failed to add to cart.');
    } finally {
      this.setBusy(false);
    }
  };

  getQuantity() {
    if (!(this.quantityInput instanceof HTMLInputElement)) return 1;
    return Math.max(1, Number.parseInt(this.quantityInput.value, 10) || 1);
  }

  getQuantityRule() {
    const fallback = { min: 1, max: null, step: 1 };
    if (!this.currentVariant) return fallback;

    const min = 1;
    const step = 1;
    const hasInventoryCap =
      this.currentVariant.inventory_management && this.currentVariant.inventory_policy !== 'continue';
    const max = hasInventoryCap ? Math.max(this.currentVariant.inventory_quantity || 0, min) : null;

    return { min, max, step };
  }

  updateQuantityConstraints() {
    if (!(this.quantityInput instanceof HTMLInputElement)) return;

    const { min, max, step } = this.getQuantityRule();
    const current = Number.parseInt(this.quantityInput.value, 10) || min;
    const normalized = max == null ? Math.max(min, current) : Math.max(min, Math.min(max, current));

    this.quantityInput.min = String(min);
    this.quantityInput.step = String(step);
    this.quantityInput.value = String(normalized);

    if (max == null) {
      this.quantityInput.removeAttribute('max');
    } else {
      this.quantityInput.max = String(max);
    }

    if (this.quantitySelector && typeof this.quantitySelector.updateConstraints === 'function') {
      if (this.currentVariant?.id) {
        this.quantitySelector.dataset.variantId = String(this.currentVariant.id);
      }
      this.quantitySelector.updateConstraints(String(min), max == null ? null : String(max), String(step));
      this.quantitySelector.setValue(String(normalized));
    }
  }

  getCartSectionIds() {
    const ids = [];
    const cartComponents = document.querySelectorAll('cart-items-component');

    for (const component of cartComponents) {
      if (!(component instanceof HTMLElement)) continue;
      const sectionId = component.dataset.sectionId;
      if (sectionId && !ids.includes(sectionId)) {
        ids.push(sectionId);
      }
    }

    return ids;
  }

  setBusy(isBusy) {
    if (this.submitButton instanceof HTMLButtonElement) {
      this.submitButton.disabled = isBusy || !this.currentVariant?.available;
    }

    if (this.form instanceof HTMLFormElement) {
      this.form.querySelectorAll('select, input, button').forEach((element) => {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLButtonElement)) return;
        if (element === this.submitButton) return;
        element.disabled = isBusy;
      });
    }
  }

  showError(message) {
    if (!(this.error instanceof HTMLElement)) return;
    this.error.textContent = message;
    this.error.classList.remove('hidden');
  }

  clearError() {
    if (!(this.error instanceof HTMLElement)) return;
    this.error.textContent = '';
    this.error.classList.add('hidden');
  }
}

new CardBuyPopup();
