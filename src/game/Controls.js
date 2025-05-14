export class Controls {
  constructor(gameState) {
    this.gameState = gameState;

    // 카메라 컨트롤을 위한 새로운 변수들
    this.cameraDistance = 15; // 기본 카메라 거리
    this.cameraHeight = 7; // 기본 카메라 높이
    this.cameraAngle = 0; // 카메라의 회전 각도 (플레이어 주변)
    this.cameraLookAtHeight = 2; // 카메라가 바라보는 높이

    console.log("Controls 클래스 생성됨");
  }

  setupEventListeners() {
    console.log("컨트롤 이벤트 리스너 설정...");

    // 안전장치: controls 객체 확인 및 초기화
    if (!this.gameState.controls) {
      console.warn(
        "Controls object is missing. Initializing default controls."
      );
      this.gameState.controls = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        brake: false,
        horn: false,
        camera: false,
      };
    }

    // 키보드 이벤트
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
    document.addEventListener("keyup", this.handleKeyUp.bind(this));

    // 마우스 휠 이벤트 (확대/축소)
    document.addEventListener("wheel", this.handleMouseWheel.bind(this));

    // 마우스 드래그 이벤트 (카메라 회전)
    document.addEventListener("mousedown", this.handleMouseDown.bind(this));
    document.addEventListener("mousemove", this.handleMouseMove.bind(this));
    document.addEventListener("mouseup", this.handleMouseUp.bind(this));

    // 터치 이벤트 (모바일 핀치 확대/축소)
    document.addEventListener("touchstart", this.handleTouchStart.bind(this), {
      passive: false,
    });
    document.addEventListener("touchmove", this.handleTouchMove.bind(this), {
      passive: false,
    });
    document.addEventListener("touchend", this.handleTouchEnd.bind(this));

    // 모바일 컨트롤 추가 (선택적)
    if ("ontouchstart" in window) {
      this.setupMobileControls();
    }

    console.log("컨트롤 이벤트 리스너 설정 완료");
  }

  // 마우스 및 터치 이벤트를 위한 변수들
  isDragging = false;
  lastMouseX = 0;
  lastMouseY = 0;
  touchStartDistance = 0;

  handleKeyDown(event) {
    // 현재 키 상태 로깅 (디버깅용)
    console.log(`키 눌림: ${event.key}`);

    switch (event.key) {
      case "ArrowUp":
      case "w":
        this.gameState.controls.forward = true;
        break;
      case "ArrowDown":
      case "s":
        this.gameState.controls.backward = true;
        break;
      case "ArrowLeft":
      case "a":
        this.gameState.controls.left = true;
        break;
      case "ArrowRight":
      case "d":
        this.gameState.controls.right = true;
        break;
      case " ":
        this.gameState.controls.brake = true;
        break;
      case "h":
        this.gameState.controls.horn = true;
        break;
      case "c":
        // 카메라 모드 전환
        this.cycleCamera();
        break;
      case "m":
        // 미니맵 토글 (선택적)
        this.toggleMinimap();
        break;
      case "q":
        // 카메라 각도 왼쪽으로 회전
        this.cameraAngle += 0.1;
        this.updateCameraPosition();
        break;
      case "e":
        // 카메라 각도 오른쪽으로 회전
        this.cameraAngle -= 0.1;
        this.updateCameraPosition();
        break;
      case "r":
        // 카메라 높이 증가
        this.cameraHeight += 1;
        this.updateCameraPosition();
        break;
      case "f":
        // 카메라 높이 감소
        this.cameraHeight = Math.max(3, this.cameraHeight - 1);
        this.updateCameraPosition();
        break;
      case "z":
        // 카메라 줌 인
        this.cameraDistance = Math.max(5, this.cameraDistance - 2);
        this.updateCameraPosition();
        break;
      case "x":
        // 카메라 줌 아웃
        this.cameraDistance += 2;
        this.updateCameraPosition();
        break;
    }
  }

  handleKeyUp(event) {
    switch (event.key) {
      case "ArrowUp":
      case "w":
        this.gameState.controls.forward = false;
        break;
      case "ArrowDown":
      case "s":
        this.gameState.controls.backward = false;
        break;
      case "ArrowLeft":
      case "a":
        this.gameState.controls.left = false;
        break;
      case "ArrowRight":
      case "d":
        this.gameState.controls.right = false;
        break;
      case " ":
        this.gameState.controls.brake = false;
        break;
      case "h":
        this.gameState.controls.horn = false;
        break;
    }
  }

  // 마우스 휠 이벤트 핸들러 (확대/축소)
  handleMouseWheel(event) {
    // 현재 카메라 모드가 'follow' 또는 'first-person'일 때만 작동
    if (
      this.gameState.camera.mode === "follow" ||
      this.gameState.camera.mode === "first-person"
    ) {
      // deltaY가 양수면 휠 아래로 (축소), 음수면 휠 위로 (확대)
      const zoomFactor = event.deltaY * 0.01;

      // 확대/축소 제한 (너무 가깝거나 멀어지지 않도록)
      if (this.gameState.camera.mode === "follow") {
        this.cameraDistance = Math.max(
          5,
          Math.min(30, this.cameraDistance + zoomFactor)
        );
      } else if (this.gameState.camera.mode === "first-person") {
        this.cameraLookAtHeight = Math.max(
          1,
          Math.min(5, this.cameraLookAtHeight + zoomFactor * 0.2)
        );
      }

      this.updateCameraPosition();
    }
  }

  // 마우스 드래그 이벤트 핸들러 (카메라 회전)
  handleMouseDown(event) {
    // 오른쪽 마우스 버튼을 누를 때만 활성화 (버튼 2)
    if (event.button === 2) {
      this.isDragging = true;
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;

      // 마우스 오른쪽 버튼의 컨텍스트 메뉴 방지
      document.addEventListener("contextmenu", this.preventContextMenu);
    }
  }

  handleMouseMove(event) {
    if (
      this.isDragging &&
      (this.gameState.camera.mode === "follow" ||
        this.gameState.camera.mode === "first-person")
    ) {
      const deltaX = event.clientX - this.lastMouseX;
      const deltaY = event.clientY - this.lastMouseY;

      // X 변화에 따라 카메라 각도 조정
      this.cameraAngle -= deltaX * 0.01;

      // Y 변화에 따라 카메라 높이 조정
      if (this.gameState.camera.mode === "follow") {
        this.cameraHeight = Math.max(
          3,
          Math.min(20, this.cameraHeight - deltaY * 0.05)
        );
      } else if (this.gameState.camera.mode === "first-person") {
        this.cameraLookAtHeight = Math.max(
          1,
          Math.min(5, this.cameraLookAtHeight - deltaY * 0.01)
        );
      }

      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;

      this.updateCameraPosition();
    }
  }

  handleMouseUp(event) {
    if (event.button === 2) {
      this.isDragging = false;
      document.removeEventListener("contextmenu", this.preventContextMenu);
    }
  }

  preventContextMenu(event) {
    event.preventDefault();
    return false;
  }

  // 터치 이벤트 핸들러 (핀치 확대/축소 및 회전)
  handleTouchStart(event) {
    if (event.touches.length === 2) {
      // 핀치 제스처 시작 - 두 손가락 사이의 거리 계산
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      this.touchStartDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );

      event.preventDefault();
    } else if (event.touches.length === 1) {
      // 단일 터치는 드래그로 처리
      this.isDragging = true;
      this.lastMouseX = event.touches[0].clientX;
      this.lastMouseY = event.touches[0].clientY;

      event.preventDefault();
    }
  }

  handleTouchMove(event) {
    if (
      event.touches.length === 2 &&
      (this.gameState.camera.mode === "follow" ||
        this.gameState.camera.mode === "first-person")
    ) {
      // 핀치 제스처 - 확대/축소
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const currentDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );

      const delta = currentDistance - this.touchStartDistance;
      this.touchStartDistance = currentDistance;

      // 확대/축소
      if (this.gameState.camera.mode === "follow") {
        this.cameraDistance = Math.max(
          5,
          Math.min(30, this.cameraDistance - delta * 0.05)
        );
      } else if (this.gameState.camera.mode === "first-person") {
        this.cameraLookAtHeight = Math.max(
          1,
          Math.min(5, this.cameraLookAtHeight - delta * 0.01)
        );
      }

      this.updateCameraPosition();
      event.preventDefault();
    } else if (
      event.touches.length === 1 &&
      this.isDragging &&
      (this.gameState.camera.mode === "follow" ||
        this.gameState.camera.mode === "first-person")
    ) {
      // 단일 터치 드래그 - 카메라 회전
      const deltaX = event.touches[0].clientX - this.lastMouseX;
      const deltaY = event.touches[0].clientY - this.lastMouseY;

      this.cameraAngle -= deltaX * 0.01;

      if (this.gameState.camera.mode === "follow") {
        this.cameraHeight = Math.max(
          3,
          Math.min(20, this.cameraHeight - deltaY * 0.05)
        );
      } else if (this.gameState.camera.mode === "first-person") {
        this.cameraLookAtHeight = Math.max(
          1,
          Math.min(5, this.cameraLookAtHeight - deltaY * 0.01)
        );
      }

      this.lastMouseX = event.touches[0].clientX;
      this.lastMouseY = event.touches[0].clientY;

      this.updateCameraPosition();
      event.preventDefault();
    }
  }

  handleTouchEnd(event) {
    this.isDragging = false;
  }

  setupMobileControls() {
    console.log("모바일 컨트롤 설정 중...");

    // 모바일 컨트롤 UI 요소 생성
    const mobileControls = document.createElement("div");
    mobileControls.id = "mobileControls";
    mobileControls.style.position = "fixed";
    mobileControls.style.bottom = "20px";
    mobileControls.style.left = "0";
    mobileControls.style.width = "100%";
    mobileControls.style.display = "flex";
    mobileControls.style.justifyContent = "center";
    mobileControls.style.gap = "20px";
    mobileControls.style.zIndex = "10";

    // 방향 컨트롤
    const directionControls = document.createElement("div");
    directionControls.style.display = "grid";
    directionControls.style.gridTemplateColumns = "1fr 1fr 1fr";
    directionControls.style.gridTemplateRows = "1fr 1fr 1fr";
    directionControls.style.gap = "5px";

    // 위, 아래, 좌, 우 버튼 생성
    const upBtn = this.createButton("↑");
    const leftBtn = this.createButton("←");
    const rightBtn = this.createButton("→");
    const downBtn = this.createButton("↓");
    const brakeBtn = this.createButton("⚠️");

    // 버튼을 그리드에 배치
    directionControls.style.width = "150px";
    directionControls.style.height = "150px";

    directionControls.appendChild(document.createElement("div")); // 빈 셀
    directionControls.appendChild(upBtn);
    directionControls.appendChild(document.createElement("div")); // 빈 셀
    directionControls.appendChild(leftBtn);
    directionControls.appendChild(brakeBtn);
    directionControls.appendChild(rightBtn);
    directionControls.appendChild(document.createElement("div")); // 빈 셀
    directionControls.appendChild(downBtn);
    directionControls.appendChild(document.createElement("div")); // 빈 셀

    // 이벤트 리스너 추가
    upBtn.addEventListener("touchstart", () => {
      this.gameState.controls.forward = true;
    });
    upBtn.addEventListener("touchend", () => {
      this.gameState.controls.forward = false;
    });

    downBtn.addEventListener("touchstart", () => {
      this.gameState.controls.backward = true;
    });
    downBtn.addEventListener("touchend", () => {
      this.gameState.controls.backward = false;
    });

    leftBtn.addEventListener("touchstart", () => {
      this.gameState.controls.left = true;
    });
    leftBtn.addEventListener("touchend", () => {
      this.gameState.controls.left = false;
    });

    rightBtn.addEventListener("touchstart", () => {
      this.gameState.controls.right = true;
    });
    rightBtn.addEventListener("touchend", () => {
      this.gameState.controls.right = false;
    });

    brakeBtn.addEventListener("touchstart", () => {
      this.gameState.controls.brake = true;
    });
    brakeBtn.addEventListener("touchend", () => {
      this.gameState.controls.brake = false;
    });

    // 오른쪽 섹션 - 카메라 컨트롤
    const cameraControls = document.createElement("div");
    cameraControls.style.display = "grid";
    cameraControls.style.gridTemplateColumns = "1fr 1fr";
    cameraControls.style.gridTemplateRows = "1fr 1fr 1fr";
    cameraControls.style.gap = "5px";
    cameraControls.style.width = "100px";
    cameraControls.style.height = "150px";

    // 카메라 버튼 생성
    const zoomInBtn = this.createButton("🔍+");
    const zoomOutBtn = this.createButton("🔍-");
    const cameraUpBtn = this.createButton("⬆️");
    const cameraDownBtn = this.createButton("⬇️");
    const changeCamBtn = this.createButton("📷");

    // 카메라 버튼 배치
    cameraControls.appendChild(zoomInBtn);
    cameraControls.appendChild(cameraUpBtn);
    cameraControls.appendChild(changeCamBtn);
    cameraControls.appendChild(changeCamBtn); // 중앙에 큰 버튼
    cameraControls.appendChild(zoomOutBtn);
    cameraControls.appendChild(cameraDownBtn);

    // 카메라 버튼 이벤트 리스너
    zoomInBtn.addEventListener("touchstart", () => {
      this.cameraDistance = Math.max(5, this.cameraDistance - 2);
      this.updateCameraPosition();
    });

    zoomOutBtn.addEventListener("touchstart", () => {
      this.cameraDistance += 2;
      this.updateCameraPosition();
    });

    cameraUpBtn.addEventListener("touchstart", () => {
      this.cameraHeight += 1;
      this.updateCameraPosition();
    });

    cameraDownBtn.addEventListener("touchstart", () => {
      this.cameraHeight = Math.max(3, this.cameraHeight - 1);
      this.updateCameraPosition();
    });

    changeCamBtn.addEventListener("touchstart", () => {
      this.cycleCamera();
    });

    mobileControls.appendChild(directionControls);
    mobileControls.appendChild(cameraControls);
    document.body.appendChild(mobileControls);

    console.log("모바일 컨트롤 설정 완료");
  }

  createButton(text) {
    const button = document.createElement("div");
    button.innerText = text;
    button.style.backgroundColor = "rgba(255, 255, 255, 0.5)";
    button.style.borderRadius = "50%";
    button.style.width = "100%";
    button.style.height = "100%";
    button.style.display = "flex";
    button.style.justifyContent = "center";
    button.style.alignItems = "center";
    button.style.fontSize = "24px";
    button.style.userSelect = "none";
    return button;
  }

  cycleCamera() {
    const modes = ["follow", "first-person", "top-down", "free"];
    const currentIndex = modes.indexOf(this.gameState.camera.mode);
    this.gameState.camera.mode = modes[(currentIndex + 1) % modes.length];

    // 카메라 모드가 변경될 때 카메라 위치/각도 초기화
    this.resetCameraDefaults();

    console.log("카메라 모드 변경:", this.gameState.camera.mode);
  }

  // 카메라 기본값 초기화
  resetCameraDefaults() {
    switch (this.gameState.camera.mode) {
      case "follow":
        this.cameraDistance = 15;
        this.cameraHeight = 7;
        this.cameraAngle = 0;
        this.cameraLookAtHeight = 2;
        break;
      case "first-person":
        this.cameraDistance = 2;
        this.cameraHeight = 3;
        this.cameraAngle = 0;
        this.cameraLookAtHeight = 2;
        break;
      case "top-down":
        // top-down 모드는 Car.js에서 직접 위치를 설정하므로 여기서는 초기화하지 않음
        break;
      case "free":
        // free 모드는 최초 위치만 설정하고 OrbitControls로 컨트롤
        this.cameraDistance = 20;
        this.cameraHeight = 10;
        this.cameraAngle = 0;
        this.cameraLookAtHeight = 0;
        break;
    }

    this.updateCameraPosition();
  }

  // 카메라 위치 업데이트
  updateCameraPosition() {
    if (this.gameState.camera.mode === "follow") {
      // 3인칭 시점 - 자동차 뒤에서 따라가는 시점 (각도 및 높이 조절 가능)
      this.gameState.camera.position = {
        x:
          this.gameState.car.position.x -
          Math.sin(this.gameState.car.rotation + this.cameraAngle) *
            this.cameraDistance,
        y: this.gameState.car.position.y + this.cameraHeight,
        z:
          this.gameState.car.position.z -
          Math.cos(this.gameState.car.rotation + this.cameraAngle) *
            this.cameraDistance,
      };
      this.gameState.camera.lookAt = {
        x: this.gameState.car.position.x,
        y: this.gameState.car.position.y + this.cameraLookAtHeight,
        z: this.gameState.car.position.z,
      };
    } else if (this.gameState.camera.mode === "first-person") {
      // 1인칭 시점 - 자동차 내부에서 시점 (시선 높이 조절 가능)
      this.gameState.camera.position = {
        x:
          this.gameState.car.position.x +
          Math.sin(this.gameState.car.rotation) * 2,
        y: this.gameState.car.position.y + 3,
        z:
          this.gameState.car.position.z +
          Math.cos(this.gameState.car.rotation) * 2,
      };
      this.gameState.camera.lookAt = {
        x:
          this.gameState.car.position.x +
          Math.sin(this.gameState.car.rotation + this.cameraAngle) * 10,
        y: this.gameState.car.position.y + this.cameraLookAtHeight,
        z:
          this.gameState.car.position.z +
          Math.cos(this.gameState.car.rotation + this.cameraAngle) * 10,
      };
    } else if (this.gameState.camera.mode === "free") {
      // 자유 모드 - 초기 위치만 설정하고 OrbitControls로 제어
      this.gameState.camera.position = {
        x: this.gameState.car.position.x + this.cameraDistance,
        y: this.gameState.car.position.y + this.cameraHeight,
        z: this.gameState.car.position.z + this.cameraDistance,
      };
      this.gameState.camera.lookAt = {
        x: this.gameState.car.position.x,
        y: this.gameState.car.position.y,
        z: this.gameState.car.position.z,
      };

      // Game.js에서 OrbitControls 활성화 요청
      if (window.game && window.game.orbitControls) {
        window.game.orbitControls.enabled = true;
      }
    }
  }

  toggleMinimap() {
    const minimap = document.getElementById("minimap");
    if (minimap) {
      minimap.style.display =
        minimap.style.display === "none" ? "block" : "none";
      console.log(
        `미니맵 ${minimap.style.display === "none" ? "숨김" : "표시"}`
      );
    }
  }
}
