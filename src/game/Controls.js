export class Controls {
  constructor(gameState) {
    this.gameState = gameState;
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

    // 모바일 컨트롤 추가 (선택적)
    if ("ontouchstart" in window) {
      this.setupMobileControls();
    }

    console.log("컨트롤 이벤트 리스너 설정 완료");
  }

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

    mobileControls.appendChild(directionControls);
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
    const modes = ["follow", "first-person", "top-down"];
    const currentIndex = modes.indexOf(this.gameState.camera.mode);
    this.gameState.camera.mode = modes[(currentIndex + 1) % modes.length];
    console.log("카메라 모드 변경:", this.gameState.camera.mode);
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
