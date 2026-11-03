package sourceproof;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.openfeign.FeignClient;

@RestController
@RequestMapping("/api")
class SpringSource {
    private final Repository repository;
    @Autowired
    SpringSource(Repository repository) { this.repository = repository; }
    @GetMapping("/items")
    public String items() { return "items"; }
    @Scheduled(cron = "0 * * * * *")
    public void refresh() { }
}
@FeignClient(name = "inventory")
interface InventoryClient {
    @GetMapping("/items")
    String items();
}
class Repository { }
