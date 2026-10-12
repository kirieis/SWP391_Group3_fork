import java.util.ArrayList;
import java.util.List;

public class Account {
    private String holder;
    private double money;
    private List<String> log = new ArrayList<>();

    public Account(String holder, double start) {
        this.holder = holder;
        this.money = start;
        log.add("OPEN:" + start);
    }

    public void deposit(double value) {
        if (value > 0) {
            money += value;
            log.add("DEPOSIT:" + value);
        } else {
            throw new IllegalArgumentException("Invalid amount");
        }
    }

    public boolean withdraw(double value) {
        if (value > 0 && value <= money) {
            money -= value;
            log.add("WITHDRAW:" + value);
            return true;
        }
        return false;
    }

    public boolean transfer(Account to, double value) {
        boolean ok = withdraw(value);
        if (ok) {
            to.deposit(value);
            log.add("TRANSFER:" + value);
        }
        return ok;
    }

    public double projected(double rate, int years) {
        double result = money;
        for (int y = 0; y < years; y++) {
            result *= 1 + rate / 100.0;
        }
        return result;
    }

    public void show() {
        System.out.println("Holder: " + holder);
        for (int i = 0; i < log.size(); i++) {
            System.out.println(i + ". " + log.get(i));
        }
        System.out.println("Balance: " + money);
    }

    public static void main(String[] args) {
        Account x = new Account("Lan", 800);
        Account y = new Account("Minh", 100);
        x.deposit(200);
        x.transfer(y, 450);
        System.out.println(y.projected(4, 3));
        x.show();
        y.show();
    }
}
