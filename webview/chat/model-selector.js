/**
 * Model Selector Module
 * 모델 선택 드롭다운 관련 기능
 * Ollama / Admin / Supported 모델 목록 표시 및 선택 처리
 */

let currentOllamaModel = '';
let availableOllamaModels = [];

export function getCurrentOllamaModel() {
  return currentOllamaModel;
}

export function setCurrentOllamaModel(model) {
  currentOllamaModel = model;
}

export function requestOllamaModels() {
  if (window.vscode) {
    window.vscode.postMessage({ command: 'getOllamaModels' });
  }
}

export function setModelLabel(name, modelType) {
  const modelLabel = document.getElementById('model-label');
  const modelSelectorButton = document.getElementById('model-selector');

  if (modelLabel) {
    modelLabel.textContent = name || 'Model';
  }
  if (modelSelectorButton) {
    if (modelType === 'supported') {
      modelSelectorButton.setAttribute('data-model-type', 'supported');
    } else if (modelType === 'admin') {
      modelSelectorButton.setAttribute('data-model-type', 'admin');
    } else {
      modelSelectorButton.setAttribute('data-model-type', 'ollama');
    }
  }
}

export function populateModelDropdown(models, current, adminModels, supportedModels) {
  const modelDropdown = document.getElementById('model-dropdown');

  // models: [{name, displayName}] 또는 ["name", ...]
  availableOllamaModels = (models || [])
    .map((m) => {
      if (typeof m === 'string') {
        return { name: m, displayName: m };
      }
      return {
        name: m?.name || '',
        displayName: m?.displayName || m?.name || '',
      };
    })
    .filter((m) => m.name);

  currentOllamaModel = current || '';

  if (!modelDropdown) {
    return;
  }
  modelDropdown.innerHTML = '';

  // 지원 모델 (서버 프리셋 기반 — 그룹별 표시)
  const supportedModelList = supportedModels || [];
  if (supportedModelList.length > 0) {
    const groups = {};
    supportedModelList.forEach((m) => {
      const g = m.group || 'default';
      if (!groups[g]) groups[g] = [];
      groups[g].push(m);
    });

    let isFirstGroup = true;
    for (const [groupName, groupModels] of Object.entries(groups)) {
      if (!isFirstGroup) {
        const divider = document.createElement('div');
        divider.style.height = '1px';
        divider.style.backgroundColor = 'var(--vscode-panel-border)';
        divider.style.margin = '2px 0';
        modelDropdown.appendChild(divider);
      }
      isFirstGroup = false;

      if (groupModels.length > 1 || Object.keys(groups).length > 1) {
        const header = document.createElement('div');
        header.style.padding = '3px 8px 1px';
        header.style.fontSize = '9px';
        header.style.fontWeight = '600';
        header.style.textTransform = 'uppercase';
        header.style.color = 'var(--vscode-descriptionForeground)';
        header.style.letterSpacing = '0.5px';
        header.textContent = groupName;
        modelDropdown.appendChild(header);
      }

      groupModels.forEach((m) => {
        const item = document.createElement('div');
        item.className = 'dropdown-option';
        if (m.name === currentOllamaModel) {
          item.classList.add('selected');
        }
        item.dataset.model = m.name;
        item.textContent = m.displayName;
        item.style.padding = '4px 8px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '10px';
        item.style.borderRadius = '4px';
        item.addEventListener('click', () => {
          currentOllamaModel = m.name;
          setModelLabel(m.displayName, 'supported');
          modelDropdown.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
          item.classList.add('selected');
          modelDropdown.classList.add('hidden');
          modelDropdown.style.display = 'none';
          window.vscode.postMessage({ command: 'setSupportedModel', key: m.key });
        });
        modelDropdown.appendChild(item);
      });
    }
  }

  // 관리자 모델 추가
  const adminModelList = adminModels || [];
  if (adminModelList.length > 0) {
    const divider = document.createElement('div');
    divider.style.height = '1px';
    divider.style.backgroundColor = 'var(--vscode-panel-border)';
    divider.style.margin = '4px 0';
    modelDropdown.appendChild(divider);

    const adminHeader = document.createElement('div');
    adminHeader.style.padding = '3px 8px 1px';
    adminHeader.style.fontSize = '9px';
    adminHeader.style.fontWeight = '600';
    adminHeader.style.textTransform = 'uppercase';
    adminHeader.style.color = 'var(--vscode-descriptionForeground)';
    adminHeader.style.letterSpacing = '0.5px';
    adminHeader.textContent = 'Admin';
    modelDropdown.appendChild(adminHeader);

    adminModelList.forEach((m) => {
      const item = document.createElement('div');
      item.className = 'dropdown-option';
      if (m.name === currentOllamaModel) {
        item.classList.add('selected');
      }
      item.dataset.model = m.name;
      item.textContent = m.displayName;
      item.style.padding = '4px 8px';
      item.style.cursor = 'pointer';
      item.style.fontSize = '10px';
      item.style.borderRadius = '4px';
      item.addEventListener('click', () => {
        currentOllamaModel = m.name;
        setModelLabel(m.displayName, 'admin');
        modelDropdown.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
        item.classList.add('selected');
        modelDropdown.classList.add('hidden');
        modelDropdown.style.display = 'none';
        window.vscode.postMessage({ command: 'setAdminModel', key: m.key });
      });
      modelDropdown.appendChild(item);
    });
  }

  // 구분선 (Ollama 모델이 있을 경우에만)
  if (availableOllamaModels.length > 0) {
    const divider = document.createElement('div');
    divider.style.height = '1px';
    divider.style.backgroundColor = 'var(--vscode-panel-border)';
    divider.style.margin = '4px 0';
    modelDropdown.appendChild(divider);
  }

  // Ollama 모델 추가
  if (availableOllamaModels.length > 0) {
    const ollamaHeader = document.createElement('div');
    ollamaHeader.style.padding = '3px 8px 1px';
    ollamaHeader.style.fontSize = '9px';
    ollamaHeader.style.fontWeight = '600';
    ollamaHeader.style.textTransform = 'uppercase';
    ollamaHeader.style.color = 'var(--vscode-descriptionForeground)';
    ollamaHeader.style.letterSpacing = '0.5px';
    ollamaHeader.textContent = 'Ollama';
    modelDropdown.appendChild(ollamaHeader);
  }
  availableOllamaModels.forEach((m) => {
    const display = m.displayName || m.name;
    const item = document.createElement('div');
    item.className = 'dropdown-option';
    if (m.name === currentOllamaModel) {
      item.classList.add('selected');
    }
    item.dataset.model = m.name;
    item.textContent = display;
    item.style.padding = '4px 8px';
    item.style.cursor = 'pointer';
    item.style.fontSize = '10px';
    item.style.borderRadius = '4px';
    item.addEventListener('click', () => {
      currentOllamaModel = m.name;
      setModelLabel(display, 'ollama');
      modelDropdown.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
      item.classList.add('selected');
      modelDropdown.classList.add('hidden');
      modelDropdown.style.display = 'none';
      window.vscode.postMessage({ command: 'setOllamaModel', model: m.name });
    });
    modelDropdown.appendChild(item);
  });

  // 현재 선택된 모델 라벨 업데이트
  const allModels = [...supportedModelList, ...adminModelList, ...availableOllamaModels];
  const currentModel = allModels.find((m) => m.name === currentOllamaModel);
  const currentDisplay = currentModel?.displayName || currentOllamaModel || 'Model';

  let modelType = 'ollama';
  if (supportedModelList.some((m) => m.name === currentOllamaModel)) {
    modelType = 'supported';
  } else if (adminModelList.some((m) => m.name === currentOllamaModel)) {
    modelType = 'admin';
  }

  setModelLabel(currentDisplay, modelType);

  if (!allModels.length) {
    const empty = document.createElement('div');
    empty.className = 'dropdown-option';
    empty.textContent = '모델을 불러올 수 없습니다';
    empty.style.padding = '6px 10px';
    modelDropdown.appendChild(empty);
  }
}

export function bindModelDropdownEvents() {
  const modelSelectorButton = document.getElementById('model-selector');
  const modelDropdown = document.getElementById('model-dropdown');

  if (!modelSelectorButton || !modelDropdown) {
    return;
  }

  const closeDropdown = () => {
    modelDropdown.classList.add('hidden');
    modelDropdown.style.display = 'none';
  };

  modelSelectorButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const willShow = modelDropdown.classList.contains('hidden');
    if (willShow) {
      const buttonRect = modelSelectorButton.getBoundingClientRect();
      const parentRect = modelSelectorButton.parentElement.getBoundingClientRect();
      const leftOffset = buttonRect.left - parentRect.left;
      modelDropdown.style.left = leftOffset + 'px';
      modelDropdown.style.right = 'auto';
      modelDropdown.style.width = buttonRect.width + 'px';

      modelDropdown.classList.remove('hidden');
      modelDropdown.style.display = 'block';

      if (availableOllamaModels.length === 0) {
        requestOllamaModels();
      }
    } else {
      closeDropdown();
    }
  });

  document.addEventListener('click', (e) => {
    if (!modelDropdown.contains(e.target) && e.target !== modelSelectorButton) {
      closeDropdown();
    }
  });
}
